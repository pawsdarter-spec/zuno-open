# Zuno 0.54 — Profile & Channel Update

This update is based on the previous Zuno Employee Dashboard + Staff Authentication + 10-member Vanity project.

## Channel mentions
- In a server text-channel composer, type `#` and begin typing a channel name.
- Choose a visible text channel from the suggestions with the mouse, Enter, or Tab.
- The sent `#channel-name` text renders as a clickable channel reference for members who can view that channel.
- References navigate by channel ID and still respect server permissions. Voice channels are not suggested.

## Server Settings → Flair
- Members with `Manage Channels` can set one emoji beside each text channel.
- Flair is saved on the server and shown to members in the channel list.
- The server validates permissions, channel type, and one-emoji input. Voice channels cannot receive Flair.

## Profile improvements
- Click your own avatar in the lower-left user panel to open your profile. The status menu also has “View My Profile”.
- Profile settings now include background opacity (10–100%) and profile frames (Aurora, Gold, Neon, Rose, Ice, or none).
- Existing profile comments and likes are preserved. Profile activity statistics now include a cumulative view count plus this week's views, likes, and comments.
- Profile views are rate-limited to one count per viewer per hour. The system stores counts, not a list of profile viewers, in the stats counter.

## Server-side validation
- Profile opacity and frame values are validated by the server.
- Channel Flair requires `Manage Channels` and only applies to text channels.
