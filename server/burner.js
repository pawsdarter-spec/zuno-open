'use strict';
// Zuno 0.53.1: no sign-ups with throwaway ("burner") email addresses.
// Three checks: a list of known throwaway services, the mail servers a domain uses (many throwaway
// services share a few, so new domains of theirs are caught too), and that the domain can get mail.
const dns = require('dns').promises;

const DOMAINS = new Set(`
0-mail.com 0815.ru 0clickemail.com 10mail.org 10minutemail.co.uk 10minutemail.com 10minutemail.net 10minutemail.org 10minemail.com 123-m.com 1secmail.com 1secmail.net 1secmail.org
20minutemail.com 2prong.com 30minutemail.com 33mail.com 4warding.com 4warding.net 4warding.org 60minutemail.com 6paq.com 7tags.com 9ox.net
a-bc.net afrobacon.com agedmail.com ajaxapp.net amilegit.com amiri.net anonbox.net anonymbox.com antichef.com antichef.net antispam.de armyspy.com
baxomale.ht.cx beefmilk.com binkmail.com bio-muesli.net bobmail.info bodhi.lawlita.com bofthew.com brefmail.com bspamfree.org bugmenot.com bumpymail.com burnermail.io buyusedlibrarybooks.org
byom.de c2.hu card.zp.ua chammy.info cheatmail.de choicemail1.com clixser.com cool.fr.nf correo.blogos.net cosmorph.com courriel.fr.nf courrieltemporaire.com
cubiclink.com dacoolest.com dandikmail.com dayrep.com dcemail.com deadaddress.com deadspam.com despam.it despammed.com devnullmail.com dfgh.net
discardmail.com discardmail.de disposableaddress.com disposableemailaddresses.com disposableinbox.com dispose.it disposeamail.com dispostable.com dm.w3internet.co.uk dodgeit.com dodgit.com dodgit.org
donemail.ru dontreg.com dontsendmespam.de drdrb.com drdrb.net dropmail.me dump-email.info dumpandjunk.com dumpmail.de dumpyemail.com e4ward.com easytrashmail.com einrot.com email60.com emaildienst.de
emailgo.de emailias.com emailigo.de emailinfive.com emaillime.com emailmiser.com emailondeck.com emailsensei.com emailtemporanea.com emailtemporanea.net emailtemporario.com.br emailthe.net emailtmp.com
emailwarden.com emailx.at.hm emailxfer.com emeil.in emeil.ir ephemail.net evopo.com explodemail.com eyepaste.com
fakeinbox.com fakeinformation.com fakemail.fr fakemailgenerator.com fakemailz.com fastacura.com fastchevy.com fastchrysler.com fastkawasaki.com fastmazda.com fastmitsubishi.com
fastnissan.com fastsubaru.com fastsuzuki.com fasttoyota.com fastyamaha.com fightallspam.com filzmail.com fizmail.com fleckens.hu flyspam.com fr33mail.info frapmail.com friendlymail.co.uk front14.org
fuckingduh.com fudgerub.com fux0ringduh.com gehensiemirnichtvorbei.de get1mail.com get2mail.fr getairmail.com getmails.eu getnada.com getonemail.com getonemail.net ghosttexter.de
gishpuppy.com gowikibooks.com gowikicampus.com greensloth.com gsrv.co.uk guerillamail.biz guerillamail.com guerillamail.de guerillamail.info guerillamail.net guerillamail.org guerrillamail.biz
guerrillamail.com guerrillamail.de guerrillamail.info guerrillamail.net guerrillamail.org guerrillamailblock.com h.mintemail.com h8s.org haltospam.com harakirimail.com hatespam.org herp.in hidemail.de
hidzz.com hmamail.com hopemail.biz ieatspam.eu ieatspam.info ihateyoualot.info imails.info inbax.tk inbox.si inboxalias.com inboxclean.com inboxclean.org
incognitomail.com incognitomail.net incognitomail.org insorg-mail.info instant-mail.de ipoo.org jetable.com jetable.fr.nf jetable.net jetable.org jnxjn.com jourrapide.com junk1e.com
kasmail.com kaspop.com keepmymail.com killmail.com killmail.net klzlk.com koszmail.pl kurzepost.de laoeq.com lawlita.com letthemeatspam.com
lhsdv.com link2mail.net litedrop.com lookugly.com lopl.co.cc lortemail.dk lr78.com lroid.com lukop.dk m21.cc mail-filter.com mail-temporaire.fr
mail.tm mail1a.de mail21.cc mail2rss.org mail333.com mail4trash.com mailbidon.com mailcatch.com mailde.de mailde.info maildrop.cc maildrop.cf maildrop.ga maildrop.gq maildrop.ml maildx.com
maileater.com mailexpire.com mailfa.tk mailforspam.com mailfree.ga mailfree.gq mailfree.ml mailfreeonline.com mailimate.com mailin8r.com mailinater.com mailinator.co.uk mailinator.com mailinator.gq
mailinator.info mailinator.net mailinator.org mailinator.us mailinator2.com mailincubator.com mailismagic.com mailme24.com mailmetrash.com mailmoat.com mailms.com mailnator.com
mailnesia.com mailnull.com mailorg.org mailpick.biz mailproxsy.com mailquack.com mailrock.biz mailscrap.com mailseal.de mailsiphon.com mailslapping.com mailslite.com mailtemp.info
mailtome.de mailtothis.com mailtrash.net mailtv.net mailtv.tv mailzilla.com mailzilla.org makemetheking.com manybrain.com mega.zik.dj meinspamschutz.de meltmail.com messagebeamer.de
mfsa.ru mierdamail.com migmail.pl mintemail.com mjukglass.nu moakt.com moakt.cc moakt.co moakt.ws mobileninja.co.uk mohmal.com moncourrier.fr.nf monemail.fr.nf monmail.fr.nf
mt2009.com mt2014.com mx0.wwwnew.eu my10minutemail.com mycleaninbox.net myemailboxy.com mymail-in.net mypartyclip.de myphantomemail.com
myspaceinc.com myspaceinc.net myspaceinc.org myspacepimpedup.com mytemp.email mytempemail.com mytempmail.com mytrashmail.com nabuma.com nepwk.com nervmich.net nervtmich.net
netmails.com netmails.net netzidiot.de neverbox.com nice-4u.com nincsmail.hu nmail.cf nobulk.com noclickemail.com nogmailspam.info nomail.pw nomail.xl.cx nomail2me.com nomorespamemails.com
nospam.ze.tc nospam4.us nospamfor.us nospammail.net notmailinator.com nowmymail.com nurfuerspam.de nwldx.com objectmail.com obobbo.com odnorazovoe.ru oneoffemail.com onewaymail.com
oopi.org opayq.com otherinbox.com ourklips.com outlawspam.com owlpic.com pancakemail.com poofy.org pookmail.com
privatdemail.net proxymail.eu prtnx.com putthisinyourspamdatabase.com quickinbox.com quickmail.nl rcpt.at reallymymail.com recode.me recursor.net
regbypass.com regbypass.comsafe-mail.net rejectmail.com rhyta.com rklips.com rmqkr.net rppkn.com rtrtr.com safersignup.de safetymail.info safetypost.de
saynotospams.com schafmail.de schrott-email.de secretemail.de selfdestructingmail.com sendspamhere.com sharklasers.com shieldedmail.com shiftmail.com shitmail.me shitware.nl
shmeriously.com skeefmail.com slaskpost.se slipry.net slopsbox.com smashmail.de smellfear.com snakemail.com sneakemail.com snkmail.com sofimail.com sofort-mail.de sogetthis.com
soodonims.com spam.la spam.su spam4.me spamail.de spamavert.com spambob.com spambob.net spambob.org spambog.com spambog.de spambog.ru spambox.info spambox.irishspringrealty.com spambox.us spamcannon.com
spamcannon.net spamcero.com spamcon.org spamcorptastic.com spamcowboy.com spamcowboy.net spamcowboy.org spamday.com spamex.com spamfree.eu spamfree24.com spamfree24.de spamfree24.eu spamfree24.info
spamfree24.net spamfree24.org spamgourmet.com spamgourmet.net spamgourmet.org spamherelots.com spamhereplease.com spamhole.com spamify.com spaminator.de spamkill.info spaml.com spaml.de spammotel.com
spamobox.com spamoff.de spamslicer.com spamspot.com spamthis.co.uk spamthisplease.com spamtrail.com speed.1s.fr spoofmail.de stuffmail.de supergreatmail.com supermailer.jp superrito.com
superstachel.de suremail.info tagyourself.com teewars.org teleworm.com teleworm.us temp-mail.io temp-mail.org temp-mail.ru tempalias.com tempe-mail.com tempemail.biz tempemail.com tempemail.net
tempinbox.co.uk tempinbox.com tempmail.co tempmail.de tempmail.dev tempmail.eu tempmail.it tempmail.net tempmail.plus tempmail.us tempmail2.com tempmaildemo.com tempmailer.com tempmailer.de tempmailo.com
temporarily.de temporarioemail.com.br temporaryemail.net temporaryemail.us temporaryforwarding.com temporaryinbox.com temporarymailaddress.com tempthe.net tempymail.com thanksnospam.info thankyou2010.com
thc.st thisisnotmyrealemail.com throam.com throwam.com throwawayemailaddress.com throwawaymail.com tilien.com tittbit.in tmail.ws tmailinator.com toiea.com tradermail.info trash-amil.com
trash-mail.at trash-mail.com trash-mail.de trash2009.com trash2010.com trash2011.com trashdevil.com trashdevil.de trashemail.de trashmail.at trashmail.com trashmail.de trashmail.me trashmail.net
trashmail.org trashmail.ws trashmailer.com trashymail.com trashymail.net trbvm.com trialmail.de turual.com twinmail.de tyldd.com uplipht.com uroid.com
us.af venompen.com veryrealemail.com vidchart.com viditag.com vomoto.com vsimcard.com vubby.com walala.org walkmail.net webm4il.info
wegwerfadresse.de wegwerfemail.com wegwerfemail.de wegwerfmail.de wegwerfmail.info wegwerfmail.net wegwerfmail.org wh4f.org whatiaas.com whatpaas.com whatsaas.com whopy.com willhackforfood.biz willselfdestruct.com
wronghead.com wuzup.net wuzupmail.net www.e4ward.com www.gishpuppy.com www.mailinator.com wwwnew.eu xagloo.com xemaps.com xents.com xmaily.com xoxy.net yep.it yopmail.com yopmail.fr
yopmail.net ypmail.webarnak.fr.eu.org yuurok.com zehnminuten.de zehnminutenmail.de zetmail.com zippymail.info zoaxe.com zoemail.org zomg.info 
emailfake.com emailnax.com fexpost.com fexbox.org mailpoof.com spymail.one inboxkitten.com tempr.email discard.email crazymailing.com burnermail.io mailsac.com tmpmail.org tmpmail.net mail7.io
linshiyouxiang.net 24hinbox.com tempail.com tmails.net tempmailaddress.com minuteinbox.com emailondeck.com guerrillamail.info 10mail.com tempmail.ninja mailnesia.com snapmail.cc
`.split(/\s+/).filter(Boolean));
// Mail servers used by throwaway services (their other domains point at these too).
const MX_BAD = [/(^|\.)mailinator\.com$/, /(^|\.)guerrillamail\.com$/, /(^|\.)yopmail\.com$/, /(^|\.)temp-mail\.org$/, /(^|\.)mail\.tm$/, /(^|\.)1secmail\./, /(^|\.)dropmail\.me$/,
  /(^|\.)mailsac\.com$/, /(^|\.)maildrop\.cc$/, /(^|\.)getnada\.com$/, /(^|\.)harakirimail\.com$/, /(^|\.)trashmail\./, /(^|\.)mohmal\.com$/, /(^|\.)moakt\./, /(^|\.)emailondeck\.com$/, /(^|\.)tempmail\./,
  /(^|\.)fakemail\./, /(^|\.)spamgourmet\./, /(^|\.)mytemp\.email$/, /(^|\.)tempr\.email$/, /(^|\.)discard\.email$/, /(^|\.)mx\.inboxkitten\.com$/, /(^|\.)mailpoof\.com$/];
// Words that throwaway domains love.
const WORDY = /(^|[.-])((temp|tmp|trash|throwaway|disposable|burner|fake|spam|junk)[-_]?(mail|box|inbox|email|addr)|\d+min(ute)?s?mail|guerr?illamail|wegwerf|jetable)[a-z0-9-]*\./;

const cache = new Map(); // domain -> { bad, at }
// The mail-server check is only used while lookups work at all (checked against big providers), so a
// DNS hiccup can never turn real people away.
let dnsOk = null, dnsAt = 0;
async function dnsWorks() {
  if (dnsOk !== null && Date.now() - dnsAt < 10 * 60e3) return dnsOk;
  dnsAt = Date.now();
  try { const r = await withTimeout(dns.resolveMx('gmail.com'), 3000); dnsOk = r.length > 0; } catch { dnsOk = false; }
  return dnsOk;
}
async function withTimeout(p, ms) { let t; try { return await Promise.race([p, new Promise((_, no) => { t = setTimeout(() => no(new Error('timeout')), ms); })]); } finally { clearTimeout(t); } }
async function domainVerdict(domain) {
  const hit = cache.get(domain);
  if (hit && Date.now() - hit.at < 6 * 3600e3) return hit.bad;
  let bad = null;
  const parts = domain.split('.');
  for (let i = 0; i < parts.length - 1 && !bad; i++) if (DOMAINS.has(parts.slice(i).join('.'))) bad = 'list';
  if (!bad && WORDY.test(domain + '.')) bad = 'name';
  if (!bad && await dnsWorks()) {
    try {
      const mx = await withTimeout(dns.resolveMx(domain), 3000);
      if (!mx.length) bad = 'nomail';
      else if (mx.some(r => MX_BAD.some(re => re.test(String(r.exchange).toLowerCase())))) bad = 'mx';
    } catch (e) {
      // No mail servers at all (and no address) means it can't get our emails either.
      if (e.code === 'ENOTFOUND' || e.code === 'ENODATA') {
        try { await withTimeout(dns.resolve4(domain), 2000); } catch (e2) { if (e2.code === 'ENOTFOUND' || e2.code === 'ENODATA') bad = 'nomail'; }
      }
      // A slow or broken lookup isn't held against anyone.
    }
  }
  cache.set(domain, { bad, at: Date.now() });
  if (cache.size > 5000) cache.delete(cache.keys().next().value);
  return bad;
}
async function checkEmail(email) {
  const domain = String(email || '').toLowerCase().split('@')[1]?.replace(/\.$/, '');
  if (!domain) return 'That email doesn\'t look right.';
  const bad = await domainVerdict(domain);
  if (bad === 'nomail') return 'That email address can\'t receive mail. Check it for typos, or use another one.';
  if (bad) return 'Throwaway email addresses can\'t be used on Zuno. Use your real email (it stays private).';
  return null;
}
module.exports = { checkEmail, domainVerdict };
