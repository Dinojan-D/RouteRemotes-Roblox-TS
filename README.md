# RouteRemotes

RouteRemotes is a simple and powerful system for managing RemoteEvents in Roblox, using a clean route-based structure.  
It includes middleware, custom client-side middleware, cooldown control, and a built-in InvokeServer system entirely based on RemoteEvents.

---

## Features

- 📦 Route-based RemoteEvent organization (no folder nesting)
- 🛡️ Secure or non-secure remote creation (RemoteEvent or UnreliableRemoteEvent)
- 🧩 Middleware support (server and client side)
- ⏳ Cooldown system (checked client-side when sending and server-side when receiving)
- 🔄 Full `InvokeServer`-like system (based purely on RemoteEvents)
- ⚡ Easy to use and integrate

---

## Installation

Simply copy the `RouteRemotesModules` folder into your project.  
Import the modules you need (`ServerNetwork` or `ClientNetwork`) to start using it.

---

## Basic Usage

### Server Example

```typescript
// Modules
import { Middleware, Network } from "shared/RouteRemotesModules/ServerNetwork";

// Start the network
Network.start();

// Create a route
Network.NewRoute("root/communication/message", {
    endPoint: "additions",
    secure: true,
    remoteType: "function",
    middleware: new Middleware(1, [
        (player: Player, msg1, msg2) => {
            print(`[Server Middleware] Message from ${player.Name}: ${msg1}, ${msg2}`);
        },
        (player: Player, msg1, msg2) => {
            if (typeOf(msg1) !== "string" || typeOf(msg2) !== "string") {
                throw "Arguments must be strings!";
            }
        }
    ]),
});

// Listen for events
Network.OnEvent("Connect", "root/communication/message", (player: Player, ...args: unknown[]) => {
    const msg1 = args[0] as string;
    const msg2 = args[1] as string;
    print(`[Server Event] Message from ${player.Name}: ${msg1}, ${msg2}`);

    // Send responses
    Network.FireClient("root/communication/message", player, `Hello ${player.Name}`, msg2);
    Network.FireClientsInList("root/communication/message", [player], "Hello players", msg2);
    Network.FireAllClients("root/communication/message", "Hello everyone", msg2);
});

// RemoteFunction example
Network.NewRoute("root", {
    endPoint: "additions",
    secure: true,
    remoteType: "function",
    middleware: new Middleware(1, [
        (player: Player, number1, number2) => {
            if (typeOf(number1) !== "number" || typeOf(number2) !== "number") {
                throw "Arguments must be numbers!";
            }
        }
    ]),
});

// Handling InvokeServer
Network.OnInvoke("Connect", "root/additions", (player: Player, number1, number2) => {
    return (number1 as number) + (number2 as number);
});
