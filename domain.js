// Pure helpers are shared by the website and its tests.
(function (scope) {
  function escapeHTML(value) {
    return String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }
  function parseMembers(text, ownEmail) {
    const emails = [...new Set([ownEmail, ...text.split(/[\s,;]+/)].map(x => x.trim().toLowerCase()).filter(Boolean))];
    if (emails.length > 100) throw new Error('A group can have up to 100 members.');
    if (emails.some(e => e.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e))) throw new Error('Check the email addresses. Use one per line or separate them with commas.');
    return emails;
  }
  function progress(participants, email) {
    const done = participants.filter(p => p.done_at).length;
    return {done, total:participants.length, complete:participants.length > 0 && done === participants.length,
      mine:participants.some(p => p.email === email && p.done_at),
      remaining:participants.filter(p => !p.done_at).map(p => p.email)};
  }
  const api = {escapeHTML, parseMembers, progress};
  if (typeof module !== 'undefined') module.exports = api;
  else scope.TogetherDomain = api;
})(globalThis);
