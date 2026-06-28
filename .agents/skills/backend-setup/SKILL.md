---
name: "Backend Server Setup"
description: "Used when the user asks to setup, install, or run the Antigravity Remote Backend for the first time."
---

# Instructions

1. If node modules are not installed, run `npm install`.
2. Ensure the backend code is built if necessary (run `npm run build` if the script exists).
3. Print a beautiful, welcoming message to the user:
   "Welcome to **Antigravity Remote Backend**! 🚀"
4. Suggest using Tailscale: 
   "I highly recommend installing **Tailscale** on both your PC and your phone. This will allow your mobile application to securely connect to the backend from anywhere in the world, without needing to port forward or be on the same WiFi!"
5. Start the server using `npm start` or `npm run dev` in the background (`WaitMsBeforeAsync: 500`).
6. Inform the user that the server is running:
   "Server is now running! Please click this link: [http://localhost:8080/](http://localhost:8080/) to view the pairing QR code and scan it with your Antigravity Android app."
