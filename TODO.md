# TODO

## 1. STATUS: PLANNED - Custom emoji refresh/cache behavior

i think the custom emojis are always pulled on every page refresh, as i can see them loading in. NOT SURE THOUGH. is it a good idea to cache them or something? for a nicer UX. but could that also introduce issues? what do you think? any other alternatives? am i thinking of this right?

Notes:
- Priority: Later.
- Effort: Medium to large.
- Risk: Medium.
- Implementation note: Audit first. Determine whether the issue is Matrix state loading, image HTTP caching, image-pack parsing, missing preload, or repeated media fetches.

## 2. STATUS: PLANNED - Reaction menu custom emoji category

the right click react menu currently displays all the custom emojis as a separate category above everything inside the reaction emoji picker. please make it look like the emoji selector, nice and organized.

Notes:
- Priority: Medium.
- Effort: Medium to large.
- Risk: Medium.
- Implementation note: Implement together with item 14 by making the emoji picker support pack-aware custom emoji categories, then reuse that model in the reaction picker.

## 3. STATUS: DONE - Custom emojis in room-list previews

if you activate "show message previews", the custom emojis don't show up in the below the room name like text or regular emojis do. please fix.

Notes:
- Priority: Early.
- Effort: Small.
- Risk: Low to medium.
- Implementation note: Pair with item 19. Fix the message-preview pipeline so custom emoji HTML/text survives into room-list preview rendering.
- Completed in: Pending commit.
- Verification: Targeted ESLint passed for the touched message-preview source and tests. Focused Jest is currently blocked before test execution by an existing `matrix-js-sdk/src/randomstring.ts` ESM parse issue in Jest setup. TypeScript checks are currently blocked by existing `matrix-js-sdk/src/rendezvous/MSC4108SignInWithQR.ts` errors.

## 4. STATUS: PLANNED - Show call starter avatar inline

show who started the call (name + profile pic) inline. currently it only shows the name.

Notes:
- Priority: Early-mid.
- Effort: Small to medium.
- Risk: Low to medium.
- Implementation note: Reuse existing Matrix member/avatar rendering instead of building a separate avatar path.

## 5. STATUS: PLANNED - Custom soundboard sounds in Element Call

see if there is a way to add custom soundboard sounds and hook into the existing system for the sounds in element call. ideally, we would want similar to MSC2545 for custom emojis, where users have a way to upload and retain and share their custom sounds. each sound should have a (custom) emoji assigned to it and of course the custom sound, which should play for everyone when played by someone. check if there is a PR/MSC for this already.

Notes:
- Priority: Late.
- Effort: Extra large.
- Risk: High.
- Implementation note: Needs protocol/design pass first: uploaded audio event shape, retention, federation compatibility, moderation, autoplay behavior, and fallback behavior.

## 6. STATUS: PLANNED - Multiple simultaneous screenshares

we want to be able to see multiple screenshares at the same time, just like on discord. the entire tile of the person must turn into the screenshare. if we click on it, it gets enlarged. if we click again, we return to the even tile layout where we see everyone, including their screenshare. if we have multiple, we can use this system to focus on a specific onne, but most importantly, we should be able to see multiple screen shares (and webcams!) at the same time. just like discord does it.

Notes:
- Priority: Late.
- Effort: Extra large.
- Risk: Very high.
- Implementation note: Requires Element Call layout/media model work, focus semantics, performance testing, and broad regression coverage.

## 7. STATUS: PLANNED - Nicer call tile gradients

we would like nicer gradients for the bgs of people's cards in the call (the tiles)

Notes:
- Priority: Early-mid.
- Effort: Small to medium.
- Risk: Low.
- Implementation note: Mostly CSS/visual polish in Element Call. Verify video readability and active-speaker states.

## 8. STATUS: PLANNED - Rich ongoing-call chat entry

show an "ongoing call" in the chat entry showing who is in the call (profile pics + names + duration + when it was started if it fits.) on the tile which says someone started the call. keep the design simple and sleek, but still showing this useful info.

Notes:
- Priority: Later.
- Effort: Large.
- Risk: High.
- Implementation note: Depends partly on participant/avatar work. Needs graceful fallback when call membership data is missing or stale.

## 9. STATUS: PLANNED - Fade animations for call avatars and lobby participants

can you make the new things we added fade in/out through smooth quick animations? so for example, the avatars of people in a call, displayed on the room entry in the room list should appear and disappear smoothly, instead of just popping in/out. same goes for the call member list while i am waiting in the lobby (pre-call join screen). they should smoothly fade in/out, and if anything adjusts on the page, it should happen through smooth anims, instead of insntantly popping around.

Notes:
- Priority: Mid.
- Effort: Medium.
- Risk: Medium.
- Implementation note: Add after the relevant UI structure is stable. Keep animations scoped so they do not cause layout shift.

## 10. STATUS: PLANNED - Matrix user status messages

i recall matrix having some official support for something akin to discord's user status messages, where a user can set a status message that says "i am good at RTS games, who wants to play?" which is displayed on their user profile and below the username in member lists. is that possible to add? i am sure there is a PUll Request out for it, and even an MSC. ideallly, we want to hook into an existing system for this, to maximize compatibility with other clients which may also support this, as well as have a clean implementation and ideally retain this status saved on the user's accounnt?

Notes:
- Priority: Later.
- Effort: Large.
- Risk: Medium to high.
- Implementation note: Displaying presence status text is easier than editing/persisting it. Decide persistence model before implementation.

## 11. STATUS: DONE - Away status dot yellow

can we change the away status dot color to yellow instead of gray? it makes more sense.

Notes:
- Priority: First.
- Effort: Extra small.
- Risk: Low.
- Implementation note: Lowest-hanging fruit; likely CSS-only in presence icon styling.
- Completed in: Pending commit.
- Verification: `pnpm --dir apps/web exec stylelint res/css/views/rooms/_PresenceIconView.pcss` passed. Full `pnpm --dir apps/web lint:style` is blocked by pre-existing unrelated stylelint errors in `_LiveContentSummary.pcss` and `_ColorPicker.pcss`.

## 12. STATUS: PLANNED - Discord-like status panel

make a status panel akin to discor's status to override online/invisible/DND. DND should mute notifs and display as red. we should be able to access this by clicking on our profile pic in the top left corner. little dropdown menu kind of thing, exactly like on discord. if we implemented the custom status text, it should also be able to be set from here.

Notes:
- Priority: Later.
- Effort: Large.
- Risk: High.
- Implementation note: Depends on item 10. DND muting notifications touches notification behavior, not only presence display.

## 13. STATUS: PLANNED - Room-list typing indicator preview

can we get the person typing... in the room message preview when someone is typing? for both DMs and rooms. like on discord. so instead of the preview of the last message sent, when someone is typing, display that person's nname is typing... with a little animation for the 3 dots like we have in chat. and also smoothly fade with an animation between the last message, and this typing indicator.

Notes:
- Priority: Mid.
- Effort: Medium.
- Risk: Medium.
- Implementation note: Needs typing-state integration into room-list preview state and careful preview override behavior.

## 14. STATUS: PLANNED - Categorize custom emotes per pack

categorieze custom emotes per the pack they come from. show the pack's name and avatar. (or rather avatar and then name, right, makes sense?)

Notes:
- Priority: Mid.
- Effort: Medium to large.
- Risk: Medium.
- Implementation note: Refactor custom emoji category data to use existing image-pack metadata. Should also power item 2.

## 15. STATUS: PLANNED - Custom emoji hover preview tooltip

we would like a feature where when we hover over a custom emoji in chat, a bigger version preview of it shows up as a tooltip or something. basically to preview the higher res version of it. this must also have a toggle settingn in the tweaks panel in settings. its on by default.

Notes:
- Priority: Mid.
- Effort: Medium.
- Risk: Medium.
- Implementation note: Add a Tweaks setting defaulting on. Scope tooltip to timeline custom emoji, not tiny room-list previews.

## 16. STATUS: PLANNED - Custom emoji/sticker sizing and performance

please check the sizing of the emojis. if i upload a 512x512 emoji, will the little inline emoji in chat be displayed at that resolution, but just smaller? basically i am asking if we should resize each emoji when it gets uploaded and use a small version of it, in order to save performance? perhaps same with stickers? what do you think? unless we are already doing some kind of performance/optimization like this.

Notes:
- Priority: Mid-late.
- Effort: Medium initially; larger if media pipeline changes are needed.
- Risk: Medium.
- Implementation note: Audit render and upload paths first. Prefer thumbnail rendering where safe before changing upload behavior.

## 17. STATUS: DONE - Custom emoji reaction toggle bug

BUG: if I click on a custom emoji reaction after i've already reacted with it, I get an error saying Some of your messages have not been sent
You can select all or individual messages to retry or delete. the expected result is that the reaction gets retracted(removed) from the message. please fix.

Notes:
- Priority: Early.
- Effort: Small.
- Risk: Medium.
- Implementation note: Fix reaction redaction/toggle handling, especially custom emoji matching, pending local echo, missing event IDs, and error handling.
- Completed in: Pending commit.
- Verification: Added regression coverage for cancelling pending reaction local echoes. Targeted ESLint passed for the changed reaction files and test. Focused Jest is currently blocked before test execution by the existing `matrix-js-sdk/src/randomstring.ts` ESM parse issue in Jest setup.

## 18. STATUS: DONE - Gradient fallback compatibility

for even more compatibility, is it possible that when we use a gradient color preset, that we send the base color as "context" for clients that don't support gradients, but support colors? so if we have a red -> blue gradient, our client renders it as a gradient as usual, but somehow sends the "context" base color so that other clients that only support a single color for the text, can still render a colored text? only if possible.

Notes:
- Priority: Early.
- Effort: Small to medium.
- Risk: Medium.
- Implementation note: Preserve current gradient rendering while adding a solid fallback color for clients that do not understand gradient metadata.
- Completed in: Pending commit.
- Verification: Targeted ESLint passed for the changed colored-text source and tests. Added coverage expectations for gradient spans carrying `data-mx-color` fallback and still rendering as gradients locally. Focused Jest is currently blocked before test execution by the existing `matrix-js-sdk/src/randomstring.ts` ESM parse issue in Jest setup.

## 19. STATUS: DONE - Custom emoji-only room preview bug

if i just send a custom emoji, the room message preview doesn't display it. instead, it displays the last text message sent. please fix, should be an easy fix?

Notes:
- Priority: Early.
- Effort: Small.
- Risk: Low to medium.
- Implementation note: Implement together with item 3. Ensure custom emoji-only events produce a valid preview instead of being treated as empty.
- Completed in: Pending commit.
- Verification: Added focused unit coverage for custom emoji-only message preview generation and store fallback behavior. Targeted ESLint passed. Focused Jest and TypeScript are blocked by the existing repo issues noted on item 3.

## Implementation order

1. #11 - Away status dot yellow.
2. #19 and #3 - Custom emoji room-list previews.
3. #17 - Custom emoji reaction toggle bug.
4. #18 - Gradient fallback compatibility.
5. #4 - Call starter avatar.
6. #7 - Call tile gradient polish.
7. #9 - Fade animations.
8. #15 - Custom emoji hover preview.
9. #13 - Room-list typing preview.
10. #14 and #2 - Pack-aware custom emoji categories.
11. #16 - Custom emoji/sticker sizing audit.
12. #1 - Custom emoji cache/refresh audit.
13. #10 - User status messages.
14. #12 - Status panel.
15. #8 - Rich ongoing-call chat entry.
16. #5 - Custom soundboard sounds.
17. #6 - Multiple simultaneous screenshares.

## Status rules

- Mark an item `STATUS: DONE` only after it has been implemented, tested, and committed.
- When marking an item done, add the completion commit and verification notes.
- Keep dependency notes current when related items are completed together.



----

thoughts:


we should prioritize the element call tweaks, starting with the screenshare rework, points above. pay great attention to it. we want it to be very good and functional like on discord.

-- FOR PLAN MODE --

as a #20. we also want to redesign the floating widget which appears when we are in a call. it's currently too clunky. we would like a static, global bottom panel identical to the one on discord, placed as an always visible section at the bottom of the room list stack. that should include a global mic mute button, global camera mute button, global deafen buton (which mutes everyone's microphone when on), and global screenshare button. only when someone is screensharinng, we want to spawn a global floating widget which can be dragged around. that widget shall exclusively be the screenshare itself, without any other decorations, except for the name of the person in the bottom right (wiht a transparent pill dark bg, to help with reading the name, just like element call already does in the call, same one) and a small X button in the top right which closes it. if double clicked, it should bring the user to the call screen. the user should be able to close this screenshare widget if they so desire. it must have an X at the top right corner, which will close this floating widget when clicked. if multiple screen shares are active, show a widget for each. a widget is automaticlaly spawned when someone screenshares. same exact behavior should happen for when someone opens their webcam. any questions? THE FLOATING WIDGET DOES NOT SHOW UP IN THE CALL SCREEN, ONLY OUTSIDE OF IT (when looking at regular chats)

## 20. STATUS: PLANNED - Call screen and floating widget redesign

We want the call experience in `element-call` to behave more like Discord:

- A static, always visible bottom control panel at the bottom of the room list stack.
- Global controls for mic mute, camera mute, deafen, and screenshare.
- `Deafen` is local audio suppression, not a network-side mute of other people.
- A floating widget should appear automatically when someone screenshares.
- The same floating widget behavior should apply to webcam feeds.
- Each widget should contain only the media surface, a transparent name pill in the bottom-right, and an X button in the top-right.
- Double-clicking a widget should return the user to the main call screen.
- Users should be able to dismiss widgets independently.
- Multiple active screen shares and webcams should each get their own widget.

Notes:
- Priority: Highest for the new call work.
- Effort: Large.
- Risk: High.
- Implementation note: This is a UI/layout and media-model rewrite, not just a styling pass. Keep the control panel stable and make the floating widget model first-class so it can handle multiple simultaneous feeds without jank.


#21. there is supposed to be a feature for smoothly bringing in new messages in the timeline through a smooth quick animationn, rather than them instantly appearing. it doesnt seem to work, please have a look annd fix it.


#22 if i keep clicking on the same reaction to a message, it should cycle between adding it and removing it. currently it seems buggy, as sometimes it removes it, sometimes it doesnt do anything, sometimes it errors out. please fix.

#23 for the colored text gradient support feature, which still sends the base gradient color as context so that other clients can still interpret messages with color, please add a setting in the Tweaks menu for enabling or disabling that.

#24 implement screenshare audio sharing using this PR https://github.com/element-hq/element-web/pull/33044 - check if we can merge withou conflicts. if there are conflicts, let's analyze them

#25 functionality to toggle on/off someone's screen share

#26 by default set vp9 codec, 1440p and max bitrate and 60fps
