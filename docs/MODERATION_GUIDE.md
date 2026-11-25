# Moderating Zuno: a guide for staff

Moderation actions affect real people, so read the context and write a clear reason before acting.

## Opening the panel

Sign in with a staff account and open **Settings › Moderation**. It has four tabs: **Reports**,
**Appeals**, **People** and **Log**. No Moderation section means the account isn't staff; staff
accounts are set by the founder (`STAFF` in `server/config.js` or the `ZUNO_STAFF` setting), never by
editing the database.

## Reports

- **Open / Resolved / All** switch between new reports, finished ones, or everything.
- **View related conversation** shows up to 35 messages around the report, with their pictures and
  videos. Reports from encrypted chats are marked "verified" when the reporter's device shared the
  keys, so you see exactly what was sent.
- **Claim report** marks it as yours, so other staff know it's being handled. **Release report**
  when you're done or can't take it. Another moderator can take over a claimed report if needed.
- **Internal note:** type a note and press **Save note**. Notes are for staff only and are never
  shown to the person reported. Use them for context, links to other reports, or why a case needs a
  second look. Don't put passwords or personal details in them.
- **Dismiss:** the message doesn't break the rules.
- **Only delete:** remove the message without warning anyone.
- **Warn:** an official warning, with a short, specific reason.
- **Timeout:** stop them posting for a while (pick how long) and say why.
- **Ban:** bans them from Zuno. Their account turns into a `DELETED_USER_####`, leaves every server,
  and they can only log in to appeal for 14 days. Be sure of the evidence first.
- **Delete message** (ticked by default) also removes the message for every action except Dismiss.
  Untick it to leave the message up.

Claims, releases and notes are all recorded in the Log, and the founder hears about them.

## People

Search by username or display name, or leave the box empty to see everyone with warnings or
timeouts. From someone's row: **Warn**, **Timeout 7d**, **Lift** (ends a timeout; it can't undo a
ban), or **Ban** (asks you to confirm).

## Appeals

Read the appeal next to the original reason and the evidence, then approve or deny. Approving brings
back their name and profile (not their servers or friends). Don't promise anyone an outcome before
you've decided.

## Log

Every moderation action: who did it, when, and the reason. Only the founder can permanently delete
log entries, reports and appeals; leave the history alone unless there's a real reason.

## Deciding

1. Read the report **and** the conversation around it. Never decide from the report reason alone.
2. Check the rules (Zuno Official's #rules and the Terms). Reports can be mistaken or made in bad
   faith.
3. Pick the lightest action that fixes it: dismiss, delete, warn, timeout, ban. Repeat behaviour
   counts.
4. Write a clear, factual, polite reason; the person sees it.
5. Claim the report and leave a note if it needs follow-up or a hand-off.
6. Check the Log if you're not sure what's already been done.

## Safety and privacy

- Never save, repost or forward suspected child sexual abuse material. Ban, keep only what the
  report already holds, and tell the founder straight away so it can be reported to the authorities
  (in the US, NCMEC's CyberTipline).
- If someone seems to be in immediate danger, tell the founder right away. Zuno isn't an emergency
  service; point them to local emergency services or a crisis line.
- Don't share reports or staff notes with the person reported or anyone outside staff.
- Don't decide on rumours, personal arguments, or who someone is. Ask the founder about anything big
  you're unsure of.
