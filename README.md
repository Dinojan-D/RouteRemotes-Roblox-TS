# RouteRemotes

**RouteRemotes** is a simple and flexible RemoteEvent management system for Roblox.  
It allows you to organize RemoteEvents using "routes", apply server-side middleware validation, handle client-side cooldowns, and perform function-like server invocations — entirely through RemoteEvents.

---

## ✨ Features

- 📂 Route-based organization of RemoteEvents (e.g., `root/player/action`)
- 🔒 Secure or non-secure (RemoteEvent or UnreliableRemoteEvent )
- ⚡ Server-side custom middleware for input validation and more
- ⏱️ Client-side cooldown verification and server-side re-verification
- 🔁 Integrated `InvokeServer`-like RemoteFunction system
---

## 📖 Notes
- Middleware only runs on the server side to validate incoming data and to verify client cooldowns.

- Client-side cooldowns are also checked on the client before firing or invoking, for better responsiveness.

- All communication is handled using RemoteEvent and UnreliableRemoteEvent — no RemoteFunction is used.

---

## 📦 Installation

Simply add the `RouteRemotesModules` folder to your project.

---

## 🚀 Quick Example

### Server-side

```typescript
// Import modules
import { Middleware, Network } from "shared/RouteRemotesModules/ServerNetwork";

// Start network
Network.start();

// Create a RemoteEvent with middleware
Network.NewRoute("root/communication/message", {
    endPoint: "additions",
    secure: true,
    remoteType: "function",
    middleware: new Middleware(1, [
        (player, msg1, msg2) => {
            if (typeOf(msg1) !== "string") throw "First argument must be a string!";
            if (typeOf(msg2) !== "string") throw "Second argument must be a string!";
        },
    ]),
});

// Handle incoming event
Network.OnEvent("Connect", "root/communication/message", (player, ...args) => {
    const [msg1, msg2] = args as [string, string];
    print(`[Server]: Message from ${player.Name}: ${msg1}, ${msg2}`);
    Network.FireClient("root/communication/message", player, `Hello ${player.Name}`, msg2);
});

// Setup a RemoteFunction-like call
Network.NewRoute("root", {
    endPoint: "additions",
    secure: true,
    remoteType: "function",
    middleware: new Middleware(1, [
        (player, number1, number2) => {
            if (typeOf(number1) !== "number") throw "First argument must be a number!";
            if (typeOf(number2) !== "number") throw "Second argument must be a number!";
        },
    ]),
});

Network.OnInvoke("Connect", "root/additions", (player, number1, number2) => {
    return (number1 as number) + (number2 as number);
});
```

### Client-Side
```typescript
// Import modules
import { Network } from "shared/RouteRemotesModules/ClientNetwork";

// Start network
Network.start();

// Send a message to the server
Network.FireServer("root/communication/message", "Hello", "Hi");

// Listen for server messages
Network.OnEvent("Connect", "root/communication/message", (...args) => {
    const [msg1, msg2] = args as [string, string];
    print(`[Client]: Server message: ${msg1}, ${msg2}`);
});

// Perform a RemoteFunction-like call
const result = Network.InvokeServer("root/additions", 5, 100);
print(`[Client]: Result from server:`, result);
```

