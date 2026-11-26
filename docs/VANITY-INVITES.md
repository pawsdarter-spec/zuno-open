# Zuno Custom Server Invites

Custom server invite links (`zuno.invite/<vanity>`) unlock when a server reaches **10 members**.

- Servers below 10 members cannot create or change a custom vanity.
- The server checks the threshold on the backend; disabling the input in the UI is not the security control.
- Once a server reaches 10 members, `vanityUnlockedAt` is saved and the unlock is permanent, even if membership later falls below 10.
- Existing staff-held vanities remain unavailable.
- Vanity codes must be 3–24 characters and use lowercase letters, numbers, or dashes.
- The server's ordinary invite continues to work before the custom vanity unlocks.

The unlock status and required member count are included in the server summary as `vanityUnlocked` and `vanityRequiredMembers`.
