---
name: Expo native picker presentation
description: Reliable system photo-picker launch behavior from a React Native modal sheet.
---

Do not launch a native system picker while a React Native `Modal` is still dismissing. On iOS, launch from the modal dismissal callback. On Android, remove the modal animation and wait until interactions settle before launching. Web must launch synchronously from the original click to retain browser user activation.

Keep interactive sheet content and its dismissible backdrop as siblings, not nested touchables. A parent backdrop press handler can otherwise clear or override the child action during the same gesture.

**Why:** A messaging Photo action appeared to do nothing on native even though the upload path worked on web; modal presentation timing and competing backdrop cancellation could suppress the picker launch.

**How to apply:** Use an explicit pending intent only for the selected system action, clear it on ordinary cancel/backdrop/close paths, and catch permission plus picker-launch errors so failures are visible.