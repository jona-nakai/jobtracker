if (!window.__JOB_TRACKER_COLLECTOR__) {
  window.__JOB_TRACKER_COLLECTOR__ = true;

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== 'COLLECT_LINKEDIN_JOB') return false;

    try {
      sendResponse({ ok: true, job: scrapeCurrentJob() });
    } catch (error) {
      sendResponse({ ok: false, error: error.message || 'Could not collect this job.' });
    }

    return true;
  });
}

function scrapeCurrentJob() {
  if (window.location.hostname === 'www.linkedin.com') return scrapeLinkedInJob();
  if (window.location.hostname === 'www.indeed.com') return scrapeIndeedJob();
  throw new Error('Open a supported job page before collecting.');
}

function scrapeLinkedInJob() {
  const clean = (value) => value?.replace(/\s+/g, ' ').trim() || '';
  const jobId = currentLinkedInJobId();
  if (!jobId || !isSupportedJobUrl()) {
    throw new Error('Open a selected LinkedIn job before collecting.');
  }

  const detailsRoot = findDetailsRoot();
  const topCard = findTopCard(detailsRoot);
  if (!topCard) {
    throw new Error('Could not find the selected job top card.');
  }

  const firstText = (selectors, root = detailsRoot) => {
    for (const selector of selectors) {
      const value = clean(root.querySelector(selector)?.innerText);
      if (value) return value;
    }
    return '';
  };
  const firstDirectText = (selectors, root = detailsRoot) => {
    for (const selector of selectors) {
      const value = clean(directText(root.querySelector(selector)));
      if (value) return value;
    }
    return '';
  };

  const topText = topCard.innerText || '';
  const topLines = topText.split('\n').map(clean).filter((line) => line && !isLinkedInChromeText(line));
  const roleTitle = extractRoleTitle();
  const company = extractCompany(roleTitle);
  const location = extractLocation(topCard, company, roleTitle);
  const salary = extractSalary(topCard);
  const insightTexts = extractInsightTexts(topCard);
  const workMode = extractWorkMode(insightTexts.concat(extractWorkModeTexts(topCard), location));
  const employmentType = extractEmploymentType(insightTexts);

  return {
    role_title: roleTitle,
    company,
    external_link: canonicalLinkedInJobUrl(),
    internal_link: extractLinkedInInternalApplyLink(topCard) || extractLinkedInInternalApplyLink(detailsRoot) || extractUniqueLinkedInCompanyApplyLink(document),
    location,
    salary,
    work_mode: workMode,
    employment_type: employmentType,
    date_posted: extractPostedDate(topCard)
  };

  function findDetailsRoot() {
    const selectors = [
      '[data-sdui-screen*="JobDetails"]',
      '[data-sdui-screen*="jobs.SemanticJobDetails"]',
      '.jobs-search__job-details--container',
      '.jobs-search__job-details',
      '.job-view-layout',
      '.jobs-details__main-content',
      '.jobs-details'
    ];
    return selectors.map((selector) => document.querySelector(selector)).find(Boolean) || null;
  }

  function findTopCard(root) {
    if (!root) return null;
    const selectors = [
      '.job-details-jobs-unified-top-card',
      '.job-details-jobs-unified-top-card__container',
      '.jobs-unified-top-card',
      '.jobs-unified-top-card__content--two-pane',
      '.jobs-details-top-card',
      '.top-card-layout',
      '[class*="top-card"]'
    ];
    const explicitCard = selectors.map((selector) => root.querySelector(selector)).find(Boolean);
    if (explicitCard) return explicitCard;

    const applyControl = [...root.querySelectorAll('button, a')]
      .find((element) => /^(easy apply|apply|save)$/i.test(clean(element.innerText)));
    return findJobHeaderAncestor(applyControl, root);
  }

  function findJobHeaderAncestor(element, root) {
    for (let current = element?.parentElement; current && current !== root.parentElement; current = current.parentElement) {
      const text = clean(current.innerText);
      if (text.length < 40 || text.length > 2500) continue;
      if (current.querySelector('h1, h2, [class*="job-title"], a[href*="/company/"]') || hasStandaloneTitleLine(current.innerText || '')) {
        return current;
      }
    }
    return null;
  }

  function currentLinkedInJobId() {
    const url = new URL(window.location.href);
    const currentJobId = url.searchParams.get('currentJobId');
    if (currentJobId) return currentJobId;
    return url.pathname.match(/\/jobs\/view\/(\d+)/)?.[1] || '';
  }

  function isSupportedJobUrl() {
    const url = new URL(window.location.href);
    return /^\/jobs\/view\/\d+\/?$/.test(url.pathname) ||
      ((url.pathname === '/jobs/search/' || url.pathname === '/jobs/search-results/') && Boolean(url.searchParams.get('currentJobId')));
  }

  function extractRoleTitle() {
    const companyLinkTexts = companyNameCandidates(topCard);
    const fieldTitle = firstDirectText([
      `a.ember-view[href*="/jobs/view/${jobId}/"]`,
      `a.d7aa8400._7d2088df[href*="/jobs/view/${jobId}/"]`,
      'p._8c358b96'
    ], topCard);
    if (fieldTitle && !isCompanyName(fieldTitle, companyLinkTexts)) return fieldTitle;

    const jobHrefSelector = jobId ? `a[href*="/jobs/view/${jobId}/"]` : 'a[href*="/jobs/view/"]';
    const detailsTitleLink = [...topCard.querySelectorAll(jobHrefSelector)]
      .find((link) => clean(link.innerText) && !/show all|full-time|apply|save/i.test(clean(link.innerText)));
    const sduiTitle = clean(detailsTitleLink?.innerText).replace(/^Selected,\s*/i, '');
    if (isLikelyRoleTitle(sduiTitle) && !isCompanyName(sduiTitle, companyLinkTexts)) return sduiTitle;

    const selectorTitle = firstText([
      '.job-details-jobs-unified-top-card__job-title h1',
      '.job-details-jobs-unified-top-card__job-title',
      '.jobs-unified-top-card__job-title h1',
      '.jobs-unified-top-card__job-title',
      '.jobs-details-top-card__job-title',
      '.top-card-layout__title',
      '[data-test-job-title]',
      '[class*="job-title"] h1',
      '[class*="job-title"]',
      'h1',
      'h2'
    ], topCard);
    if (isLikelyRoleTitle(selectorTitle) && !isCompanyName(selectorTitle, companyLinkTexts)) return selectorTitle;

    return firstTitleLine(topLines, companyLinkTexts);
  }

  function extractCompany(title) {
    const fieldCompany = firstText([
      'a[href*="/company/"][href*="/life"]',
      'a[href*="/school/"][href*="/life"]'
    ], topCard);
    if (fieldCompany && fieldCompany.toLowerCase() !== title.toLowerCase()) return fieldCompany;

    const titleLink = [...topCard.querySelectorAll(jobId ? `a[href*="/jobs/view/${jobId}/"]` : 'a[href*="/jobs/view/"]')]
      .find((link) => clean(link.innerText).replace(/^Selected,\s*/i, '') === title);
    const companyLinkNearTitle = titleLink?.closest('[data-component-type="LazyColumn"], [data-sdui-component], div')
      ?.querySelector('a[href*="/company/"]');
    const scopedCompany = clean(companyLinkNearTitle?.innerText);
    if (scopedCompany && scopedCompany.toLowerCase() !== title.toLowerCase()) return scopedCompany;

    const companyLocationLine = topLines.find((line) => line.includes(' • ') && /,\s*[A-Z]{2}\b/.test(line));
    const companyFromLine = clean(companyLocationLine?.split(' • ')[0] || '');
    if (companyFromLine) return companyFromLine;

    const topCardCompany = firstText([
      '.job-details-jobs-unified-top-card__company-name a',
      '.job-details-jobs-unified-top-card__company-name',
      '.jobs-unified-top-card__company-name a',
      '.jobs-unified-top-card__company-name',
      '.jobs-details-top-card__company-url',
      '.jobs-details-top-card__company-info a',
      '.topcard__org-name-link',
      '.top-card-layout__card a[href*="/company/"]',
      'a[href*="/company/"]'
    ], topCard);
    if (topCardCompany && topCardCompany.toLowerCase() !== title.toLowerCase()) return topCardCompany;

    return '';
  }

  function canonicalLinkedInJobUrl() {
    if (jobId) return `https://www.linkedin.com/jobs/view/${jobId}/`;

    const jobLink = detailsRoot.querySelector('a[href*="/jobs/view/"]') || document.querySelector('a[href*="/jobs/view/"]');
    const href = jobLink?.href || window.location.href;
    const hrefMatch = href.match(/\/jobs\/view\/(\d+)/);
    return hrefMatch ? `https://www.linkedin.com/jobs/view/${hrefMatch[1]}/` : href;
  }

  function extractLinkedInInternalApplyLink(root) {
    const applyLinks = [...(root?.querySelectorAll('a[href]') || [])]
      .filter((link) => /apply/i.test(link.getAttribute('aria-label') || clean(link.innerText)));

    for (const link of applyLinks) {
      const internalLink = extractSafetyGoUrl(link.href);
      if (internalLink) return internalLink;
    }

    return '';
  }

  function extractUniqueLinkedInCompanyApplyLink(root) {
    const links = [...(root?.querySelectorAll('a[href*="/safety/go/"]') || [])]
      .filter((link) => /apply on company website/i.test(link.getAttribute('aria-label') || ''))
      .map((link) => extractSafetyGoUrl(link.href))
      .filter(Boolean);
    return new Set(links).size === 1 ? links[0] : '';
  }

  function extractSafetyGoUrl(href) {
    try {
      const url = new URL(href);
      if (url.hostname !== 'www.linkedin.com' || url.pathname !== '/safety/go/') return '';
      return safeExternalApplyUrl(url.searchParams.get('url') || '');
    } catch {
      return '';
    }
  }

  function safeExternalApplyUrl(value) {
    try {
      const url = new URL(value);
      if (!['http:', 'https:'].includes(url.protocol)) return '';
      if (url.hostname.endsWith('linkedin.com')) return '';
      return url.href;
    } catch {
      return '';
    }
  }

  function companyNameCandidates(root) {
    return [...root.querySelectorAll('a[href*="/company/"], a[href*="/school/"]')]
      .map((link) => clean(link.innerText))
      .filter(Boolean);
  }

  function directText(element) {
    if (!element) return '';
    return [...element.childNodes]
      .filter((node) => node.nodeType === Node.TEXT_NODE)
      .map((node) => node.textContent)
      .join(' ');
  }

  function firstTitleLine(lines, companyNames = []) {
    return lines.find((line) => isLikelyRoleTitle(line) && !isCompanyName(line, companyNames)) || '';
  }

  function hasStandaloneTitleLine(text) {
    return text.split('\n').map(clean).some((line) => isLikelyRoleTitle(line));
  }

  function isCompanyName(text, companyNames) {
    const lower = clean(text).toLowerCase();
    return companyNames.some((name) => lower === name.toLowerCase());
  }

  function isLikelyRoleTitle(text) {
    return Boolean(text) &&
      text.length <= 120 &&
      !isLinkedInChromeText(text) &&
      !/\$|\/\s?(yr|year|hour|hr|mo|month)|\b(yr|year|hour|hr|salary|compensation)\b|remote|hybrid|in-person|on-site|onsite/i.test(text) &&
      !/\b(apply|save|applicant|viewed|reposted|promoted|full-time|part-time|contract|internship|temporary|ago)\b/i.test(text) &&
      !/[•·]/.test(text);
  }

  function extractLocation(root, companyName, title) {
    const fieldLocation = firstMatchingText([
      '.tvm__text.tvm__text--low-emphasis',
      'span.e0d2ec4d'
    ], (text) => (
      text !== title &&
      text !== companyName &&
      /,|remote|hybrid|united states|\b[A-Z]{2}\b/i.test(text)
    ), root);
    if (fieldLocation) {
      return fieldLocation;
    }

    const metadataLocation = extractMetadataLocation(root, companyName, title);
    if (metadataLocation) return metadataLocation;

    const cityStateFromTopText = clean((topText.match(/[A-Z][A-Za-z .'-]+,\s*[A-Z]{2}\b/) || [])[0]);
    if (cityStateFromTopText) return cityStateFromTopText;

    const candidates = [
      firstText(['.job-details-jobs-unified-top-card__primary-description-container'], root),
      firstText(['.jobs-unified-top-card__primary-description'], root),
      firstText(['.jobs-details-top-card__primary-description'], root),
      firstText(['.jobs-unified-top-card__bullet'], root),
      firstText(['.jobs-details-top-card__bullet'], root)
    ].filter(Boolean);

    for (const candidate of candidates) {
      const parts = candidate
        .split(/ · | \u00b7 |\n/)
        .map(clean)
        .filter(Boolean)
        .filter((part) => !companyName || part.toLowerCase() !== companyName.toLowerCase())
        .filter((part) => !title || part.toLowerCase() !== title.toLowerCase())
        .filter((part) => !/\d+\s+(applicant|connection|people clicked)/i.test(part))
        .filter((part) => !/(promoted|reposted|actively recruiting|responses managed|full-time|part-time|contract|internship)/i.test(part));
      const locationPart = parts.find((part) => /remote|hybrid|united states|,|area|city|county|\b[A-Z]{2}\b/i.test(part));
      if (locationPart) return locationPart;
    }

    return firstText([
      '.jobs-unified-top-card__bullet',
      '.jobs-unified-top-card__workplace-type',
      '.jobs-details-top-card__bullet',
      '[class*="workplace-type"]'
    ], root);
  }

  function extractMetadataLocation(root, companyName, title) {
    const metadataContainers = [
      ...root.querySelectorAll('.job-details-jobs-unified-top-card__primary-description-container, .jobs-unified-top-card__primary-description, .jobs-details-top-card__primary-description, .jobs-unified-top-card__bullet, .jobs-details-top-card__bullet')
    ];

    for (const container of metadataContainers) {
      const containerText = clean(container.innerText);
      if (!/,/.test(containerText) && !/remote|hybrid|united states|area|city|county/i.test(containerText)) continue;

      const spans = [...container.querySelectorAll('span')]
        .map((span) => clean(span.innerText))
        .filter(Boolean)
        .filter((text) => text !== '·' && text !== '.')
        .filter((text) => !companyName || text.toLowerCase() !== companyName.toLowerCase())
        .filter((text) => !title || text.toLowerCase() !== title.toLowerCase())
        .filter((text) => !/\d+\s+(applicant|connection|people clicked)/i.test(text))
        .filter((text) => !/(promoted|reposted|actively recruiting|responses managed|full-time|part-time|contract|internship)/i.test(text));

      const location = spans.find((text) => /,|remote|hybrid|united states|area|city|county/i.test(text)) || spans[0];
      if (location) return location;
    }

    return '';
  }

  function firstMatchingText(selectors, predicate, root = detailsRoot) {
    for (const selector of selectors) {
      for (const element of root.querySelectorAll(selector)) {
        const value = clean(element.innerText);
        if (value && predicate(value)) return value;
      }
    }
    return '';
  }

  function extractCityStateFromLines(lines) {
    const states = 'AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|IA|ID|IL|IN|KS|KY|LA|MA|MD|ME|MI|MN|MO|MS|MT|NC|ND|NE|NH|NJ|NM|NV|NY|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VA|VT|WA|WI|WV|WY|DC';
    const cityState = new RegExp(`([A-Z][A-Za-z .'-]+,\\s*(?:${states})\\b)`);
    const preferredLine = lines.find((line) => cityState.test(line) && /\d+\s+(minute|hour|day|week|month)s?\s+ago/i.test(line));
    const fallbackLine = lines.find((line) => cityState.test(line) && !/(search|filter|people|applicant|connection)/i.test(line));
    const match = (preferredLine || fallbackLine || '').match(cityState);
    return clean(match?.[1] || '');
  }

  function extractSalary(root) {
    const salaryPattern = /\$\s?\d+(?:,\d{3})*(?:\.\d+)?\s?[KkMm]?(?:\s?\/\s?(?:year|month|hour|yr|hr|mo))?(?:\s?[-–]\s?\$\s?\d+(?:,\d{3})*(?:\.\d+)?\s?[KkMm]?(?:\s?\/\s?(?:year|month|hour|yr|hr|mo))?)?/;
    const candidates = topCardFieldTexts(root)
      .filter((text) => /\$/.test(text));
    const match = candidates.map((text) => text.match(salaryPattern)?.[0]).find(Boolean);
    return clean(match || '');
  }

  function extractPostedDate(root) {
    const text = firstText([
      '.tvm__text.tvm__text--positive',
      'span._6810e779'
    ], root);
    return inferPostedDate(text);
  }

  function extractInsightTexts(root) {
    return [
      ...new Set(
        [
          ...insightElements(root).map((element) => clean(element.innerText)),
          ...topCardFieldTexts(root).filter((text) => (
            /\b(full-time|part-time|contract|internship|temporary|freelance|apprenticeship|seasonal)\b/i.test(text) ||
            /\b(remote|hybrid|in-person|on-site|onsite)\b/i.test(text) ||
            /\$/.test(text)
          ))
        ].filter(Boolean)
      )
    ];
  }

  function extractWorkModeTexts(root) {
    const preferenceText = firstText([
      'button .tvm__text.tvm__text--low-emphasis strong',
      'a[href*="/jobs/search-results/"] span span',
      'span.c4707084 span'
    ], root);
    return [
      preferenceText,
      ...topCardFieldTexts(root)
    ].filter((text) => /^(remote|hybrid|in-person|on-site|onsite)$/i.test(text));
  }

  function topCardFieldTexts(root) {
    return [...root.querySelectorAll([
      'button .tvm__text.tvm__text--low-emphasis strong',
      'button .tvm__text.tvm__text--low-emphasis',
      'span.c4707084 span',
      'a[href*="/jobs/search-results/"] span span'
    ].join(', '))]
      .map((element) => clean(element.innerText))
      .filter(Boolean)
      .filter((text) => !isLinkedInChromeText(text))
      .filter((text) => text.length <= 160);
  }

  function insightElements(root) {
    return [
      ...root.querySelectorAll([
        '.job-details-jobs-unified-top-card__job-insight',
        '.jobs-unified-top-card__job-insight',
        '.jobs-unified-top-card__job-insight-view-model-secondary',
        'li[class*="job-insight"]',
        'span[class*="job-insight"]',
        '[class*="workplace-type"]',
        '[class*="salary"]',
        '[class*="compensation"]'
      ].join(', '))
    ];
  }

  function isLinkedInChromeText(text) {
    return /^(logo|back to results list|skip to main content|linkedin|jobs|messaging|notifications|home|my network)$/i.test(text) ||
      /\b(premium|try premium|free trial|unlock|who viewed your profile)\b/i.test(text);
  }

  function extractWorkMode(insights) {
    const lower = insights.join(' ').toLowerCase();
    if (lower.includes('remote')) return 'Remote';
    if (lower.includes('hybrid')) return 'Hybrid';
    if (lower.includes('in-person') || lower.includes('on-site') || lower.includes('onsite')) return 'In Person';
    return 'Unknown';
  }

  function extractEmploymentType(insights) {
    const lower = insights.join(' ').toLowerCase();
    if (lower.includes('internship')) return 'Internship';
    if (lower.includes('part-time')) return 'Part Time';
    if (lower.includes('contract')) return 'Contract';
    if (lower.includes('full-time')) return 'Full Time';
    return 'Unknown';
  }

  function inferPostedDate(text) {
    const match = text.match(/(\d+)\s+(minute|hour|day|week|month)s?\s+ago/i);
    if (!match) return '';
    const amount = Number(match[1]);
    const unit = match[2].toLowerCase();
    const date = new Date();
    if (unit === 'minute') date.setMinutes(date.getMinutes() - amount);
    if (unit === 'hour') date.setHours(date.getHours() - amount);
    if (unit === 'month') date.setMonth(date.getMonth() - amount);
    if (unit === 'week') date.setDate(date.getDate() - amount * 7);
    if (unit === 'day') date.setDate(date.getDate() - amount);
    return [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, '0'),
      String(date.getDate()).padStart(2, '0')
    ].join('-');
  }
}

function scrapeIndeedJob() {
  const clean = (value) => value?.replace(/\s+/g, ' ').trim() || '';
  const header = findIndeedHeader();
  if (!header) {
    throw new Error('Open a selected Indeed job before collecting.');
  }

  const roleTitle = clean(
    directText(header.querySelector('[data-testid="jobsearch-JobInfoHeader-title"] > span')) ||
    header.querySelector('[data-testid="jobsearch-JobInfoHeader-title"]')?.innerText?.replace(/\s+-\s+job post\s*$/i, '')
  );
  const company = clean(directText(header.querySelector('[data-testid="inlineHeader-companyName"] a')) || header.querySelector('[data-testid="inlineHeader-companyName"]')?.innerText);
  const locationWorkMode = parseIndeedLocationAndWorkMode(header);
  const salaryAndType = parseIndeedSalaryAndType(header);

  return {
    role_title: roleTitle,
    company,
    external_link: canonicalIndeedJobUrl(header),
    source: 'Indeed',
    location: locationWorkMode.location,
    salary: salaryAndType.salary,
    work_mode: locationWorkMode.workMode,
    employment_type: salaryAndType.employmentType,
    date_posted: ''
  };

  function findIndeedHeader() {
    return document.querySelector('.jobsearch-HeaderContainer') ||
      document.querySelector('.jobsearch-InfoHeaderContainer') ||
      document.querySelector('[data-testid="jobsearch-JobInfoHeader-title"]')?.closest('section, div');
  }

  function parseIndeedLocationAndWorkMode(root) {
    const text = clean(root.querySelector('[data-testid="inlineHeader-companyLocation"]')?.innerText);
    const parts = text.split(/[•·]/).map(clean).filter(Boolean);
    const workModePart = parts.find((part) => /^(remote|hybrid|in person|in-person|on-site|onsite)$/i.test(part)) || '';
    const locationPart = parts.find((part) => part !== workModePart) || '';
    return {
      location: locationPart,
      workMode: normalizeIndeedWorkMode(workModePart || text)
    };
  }

  function parseIndeedSalaryAndType(root) {
    const container = root.querySelector('#salaryInfoAndJobType');
    const spans = [...(container?.querySelectorAll('span') || [])].map((span) => clean(span.innerText)).filter(Boolean);
    const salary = spans.find((text) => /\$/.test(text)) || '';
    const typeText = spans.find((text) => /\b(full-time|part-time|contract|internship|temporary|freelance|seasonal)\b/i.test(text)) || '';
    return {
      salary,
      employmentType: normalizeIndeedEmploymentType(typeText)
    };
  }

  function canonicalIndeedJobUrl(root) {
    const url = new URL(window.location.href);
    const jk = url.searchParams.get('jk') || url.searchParams.get('vjk') || root.querySelector('[data-indeed-apply-jk]')?.getAttribute('data-indeed-apply-jk') || '';
    return jk ? `https://www.indeed.com/viewjob?jk=${jk}` : '';
  }

  function normalizeIndeedWorkMode(value) {
    const lower = value.toLowerCase();
    if (lower.includes('remote')) return 'Remote';
    if (lower.includes('hybrid')) return 'Hybrid';
    if (lower.includes('on-site') || lower.includes('onsite') || lower.includes('in person') || lower.includes('in-person')) return 'In Person';
    return 'Unknown';
  }

  function normalizeIndeedEmploymentType(value) {
    const lower = value.toLowerCase();
    if (lower.includes('internship')) return 'Internship';
    if (lower.includes('part-time')) return 'Part Time';
    if (lower.includes('contract')) return 'Contract';
    if (lower.includes('full-time')) return 'Full Time';
    if (lower.includes('temporary')) return 'Temporary';
    if (lower.includes('freelance')) return 'Freelance';
    if (lower.includes('seasonal')) return 'Seasonal';
    return 'Unknown';
  }

  function directText(element) {
    if (!element) return '';
    return [...element.childNodes]
      .filter((node) => node.nodeType === Node.TEXT_NODE)
      .map((node) => node.textContent)
      .join(' ');
  }
}
