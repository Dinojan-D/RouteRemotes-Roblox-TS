//{GameServices}}-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
import { ReplicatedStorage, RunService } from "@rbxts/services";
if (!RunService.IsClient()) {
	throw "This code must run on the client side only.";
}

//{Types}}-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
type _remoteType = "function" | "event";
type _eventType = "Connect" | "ConnectParallel" | "Once";

interface SimpleRouteInfo {
	remote: RemoteEvent | UnreliableRemoteEvent;
	secure: boolean;
	remoteType: _remoteType;
	cooldown?: number;
}
interface RouteLog {
	lastFireServer: number;
}

//{Root Route Parameters}-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
const ROOT_ROUTE_NAME: string = "root"; //if you change this,you need to change the server too

//{Singleton}-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
/**
 * Singleton class that manages the routing network using a tree structure.
 * @method start - Initializes the network and builds the route tree.
 */
export class Network {
	private static instance: Network | undefined;
	public routingTable: { [key: string]: SimpleRouteInfo } = {};
	public log: { [route: string]: RouteLog } = {};
	public connections: { [route: string]: RBXScriptConnection | undefined } = {};

	/**
	 * Constructs a new Network instance using a given routing table.
	 * This should not be used directly; use Network.start() instead to ensure proper initialization.
	 *
	 * @param routingTable - A dictionary mapping route names to route info (remote object, type, cooldown, etc.)
	 */
	constructor(routingTable: { [key: string]: SimpleRouteInfo }) {
		this.routingTable = routingTable;
	}

	/**
	 * Initializes the singleton Network instance and fetches the remote communication tree from the server.
	 *
	 * Must be called before using any other Network methods. If initialization fails,
	 * an exception will be thrown.
	 */
	public static start() {
		if (!this.instance) {
			const initRoute = ReplicatedStorage.WaitForChild("NetworkRemotes")
				.WaitForChild("get-tree")
				.WaitForChild("get-tree") as RemoteEvent;
			this.instance = new Network({
				"root/network/get-tree": { cooldown: 5, secure: true, remoteType: "function", remote: initRoute },
			});

			const simplifiedTree = this.InvokeServer("root/network/get-tree", 5);

			if (simplifiedTree === undefined) {
				this.instance = undefined;
				throw "Failed to initialize Network: 'get-tree' returned undefined. Ensure the client response is correctly set up.";
			}

			this.instance = new Network(simplifiedTree as { [key: string]: SimpleRouteInfo });
		}
	}

	/**
	 * Retrieves the route information for a given route string from the routing table.
	 *
	 * Throws an error if the route does not exist or the Network has not been initialized.
	 *
	 * @param route - The route key to look up.
	 * @returns The SimpleRouteInfo associated with the route.
	 */
	private static getRoute(route: string): SimpleRouteInfo {
		if (!this.instance) {
			throw "ClientNetwork not started";
		}
		const routeInfo = this.instance.routingTable[route];

		if (routeInfo) {
			return routeInfo;
		} else {
			throw `Route ${route} not found , or not charged to the client`;
		}
	}

	/**
	 * Sends data to the server using the specified route if it is an event-type remote.
	 *
	 * This method enforces route cooldowns to prevent spamming and ensures the route exists.
	 *
	 * @param route - The name of the route to fire.
	 * @param args - The arguments to send to the server.
	 */
	public static FireServer(route: string, ...args: unknown[]) {
		if (!this.instance) {
			throw "ClientNetWork not initialized, please do 'Network.start()'";
		}

		const currentTime = os.clock();
		const routeInfo = this.getRoute(route);
		if (routeInfo.remoteType === "function") {
			throw `Route '${route}' is not a event`;
		}
		if (routeInfo && routeInfo.cooldown) {
			if (this.instance.log[route]) {
				if (currentTime - this.instance.log[route].lastFireServer < routeInfo.cooldown) {
					throw `Route ${route} is on cooldown (${routeInfo.cooldown} seconds)`;
				}
			}
		}

		if (routeInfo.remote.IsA("RemoteEvent")) {
			routeInfo.remote.FireServer(...args);
		} else if (routeInfo.remote.IsA("UnreliableRemoteEvent")) {
			routeInfo.remote.FireServer(...args);
		}
		this.instance.log[route] = {
			lastFireServer: currentTime,
		};
	}

	/**
	 * Registers a callback function to be triggered when the server fires an event to the client.
	 *
	 * This method ensures only one listener is active per route and supports one-time or continuous listeners.
	 *
	 * @param eventType - The type of connection ("Connect", "ConnectParallel", or "Once").
	 * @param route - The name of the event route to listen on.
	 * @param callback - The function to be called when the event is received.
	 */
	public static OnEvent(eventType: _eventType, route: string, callback: (...args: unknown[]) => void) {
		if (!this.instance) {
			throw "ClientNetWork not initialized, please do 'Network.start()'";
		}
		const routeInfo = this.getRoute(route);
		if (routeInfo.remoteType === "function") {
			throw `Route '${route}' is not a event`;
		}

		if (this.instance.connections[route]) {
			throw `Route ${route} already connected`;
		}

		this.instance.connections[route] = routeInfo.remote.OnClientEvent[eventType]((...args: unknown[]) => {
			callback(...args);
		});
	}

	/**
	 * Calls a server function and waits for a response synchronously (with timeout).
	 *
	 * Used for fetching data or triggering logic on the server that returns a value.
	 *
	 * @param route - The route of the server function to call.
	 * @param waitTime - How long (in seconds) to wait for a response before timing out.
	 * @param args - Arguments to pass to the server function.
	 * @returns The response from the server, or undefined if the call times out.
	 */
	public static InvokeServer(route: string, waitTime: number, ...args: unknown[]): unknown {
		if (!this.instance) {
			throw "ClientNetWork not initialized, please do 'Network.start()'";
		}
		const currentTime = os.clock();
		const routeInfo = this.getRoute(route);

		if (routeInfo.remoteType !== "function") {
			throw `Route '${route}' is not a function`;
		}
		if (routeInfo && routeInfo.cooldown) {
			if (this.instance.log[route]) {
				if (currentTime - this.instance.log[route].lastFireServer < routeInfo.cooldown) {
					throw `Route ${route} is on cooldown (${routeInfo.cooldown} seconds)`;
				}
			}
		}
		let connection: RBXScriptConnection | undefined = undefined;
		let result: unknown = undefined;
		let startTime: number = 0;

		connection = routeInfo.remote.OnClientEvent.Once((serverResult: unknown | undefined) => {
			result = serverResult;
		});

		if (routeInfo.remote.IsA("RemoteEvent")) {
			routeInfo.remote.FireServer(...args);
		} else if (routeInfo.remote.IsA("UnreliableRemoteEvent")) {
			routeInfo.remote.FireServer(...args);
		}
		startTime = os.clock();
		this.instance.log[route] = {
			lastFireServer: currentTime,
		};
		while (os.clock() - startTime < waitTime && result === undefined) {
			wait(0.1);
		}
		if (connection) {
			connection.Disconnect();
		}
		return result;
	}

	/**
	 * Disconnects any event listener associated with a specific route.
	 *
	 * Useful to clean up memory or prevent duplicate listeners.
	 *
	 * @param route - The route for which the event listener should be removed.
	 */
	public static Disconnect(route: string) {
		if (!this.instance) {
			throw "ClientNetWork not initialized, please do 'Network.start()'";
		}
		if (this.instance.connections[route]) {
			this.instance.connections[route].Disconnect();
			this.instance.connections[route] = undefined;
		}
	}
}
