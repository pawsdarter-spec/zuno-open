'use strict';
// Moved out of the page so the site's security policy can block scripts written inside pages.
const q = new URLSearchParams(location.search);
if (q.has("gift")) {
  document.getElementById("t").textContent = "Gift sent! 🎁";
  document.getElementById("m").textContent = "Your friend has Bloom now, and your gift shows up in your DM with them.";
} else if (q.has("canceled")) {
  document.getElementById('t').textContent = 'No worries';
  document.getElementById('m').textContent = "You weren't charged. You can get Bloom any time from Settings > Zuno Bloom.";
} else if (q.has('manage')) {
  document.getElementById('t').textContent = 'All set';
  document.getElementById('m').textContent = 'Any changes to your Bloom show up in Zuno in a few seconds.';
}
