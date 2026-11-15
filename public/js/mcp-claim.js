(function () {
  const form = document.getElementById('mcpClaimForm');
  const resultEl = document.getElementById('claimResult');
  if (!form || !resultEl) return;

  const csrf = form.querySelector('input[name="_csrf"]')?.value || '';

  function proofLines(claim) {
    const evidence = claim.evidence || {};
    const email = evidence.emailDomain || {};
    const site = evidence.siteFile || {};
    const github = evidence.githubFile || {};
    const lines = [
      email.pass
        ? `Email domain ${email.domain} matches ${email.host}.`
        : `Email domain ${email.domain || '(none)'} does not match the listing host.`,
      site.pass
        ? `Found the code at ${site.url}.`
        : `Site file not confirmed${site.url ? ` (${site.url})` : ''}.`,
      github.pass
        ? `Found the code in ${github.repo}.`
        : `GitHub file not confirmed${github.repo ? ` (${github.repo})` : ''}.`,
    ];
    if (!evidence.anyPass) {
      lines.push('');
      lines.push(`Publish this exact line, then re-check:`);
      lines.push(claim.claimLine);
      (claim.proofUrls || []).forEach((url) => lines.push(url));
      if (github.repo) {
        lines.push(`Or commit it to ${github.repo} at .well-known/influzer-claim.txt on the default branch.`);
      }
    } else {
      lines.push('');
      lines.push('At least one check passed. Influzer still approves the claim before you can edit the listing.');
    }
    return lines.join('\n');
  }

  function show(claim) {
    resultEl.hidden = false;
    resultEl.textContent = '';
    const pre = document.createElement('pre');
    pre.style.whiteSpace = 'pre-wrap';
    pre.style.margin = '0 0 12px';
    pre.textContent = proofLines(claim);
    resultEl.appendChild(pre);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'mcp-submit-btn';
    button.textContent = 'Re-check proof';
    button.addEventListener('click', async () => {
      button.disabled = true;
      try {
        const res = await fetch(`/api/mcp/claims/${encodeURIComponent(claim.id)}/recheck`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
          body: '{}',
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Recheck failed');
        show(data.claim);
      } catch (err) {
        button.disabled = false;
        const msg = document.createElement('p');
        msg.textContent = err.message || 'Recheck failed';
        resultEl.appendChild(msg);
      }
    });
    resultEl.appendChild(button);
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = document.getElementById('claimSubmit');
    button.disabled = true;
    resultEl.hidden = false;
    resultEl.textContent = 'Checking the listing…';
    try {
      const res = await fetch('/api/mcp/claims', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
        body: JSON.stringify({
          slug: document.getElementById('claimSlug').value.trim().toLowerCase(),
          relationship: document.getElementById('claimRelationship').value,
          note: document.getElementById('claimNote').value.trim(),
          githubLogin: document.getElementById('claimGithub').value.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Claim failed');
      show(data.claim);
    } catch (err) {
      resultEl.textContent = err.message || 'Claim failed';
      button.disabled = false;
    }
  });
})();
