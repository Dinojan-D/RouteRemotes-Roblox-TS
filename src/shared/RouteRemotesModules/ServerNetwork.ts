//{GameServices}}-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
import { Players, ReplicatedStorage, RunService } from "@rbxts/services";
if (!RunService.IsServer()) {
	throw "This code must run on the server side only.";
}
//At Line 180 to 185 you can change the default settings of Root Route
//{Types}}-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
type _remoteType = "function" | "event";
type _eventType = "Connect" | "ConnectParallel" | "Once";

interface RouteLog {
	lastUse: number;
}

interface SimpleRouteInfo {
	remote: RemoteEvent | UnreliableRemoteEvent;
	secure: boolean;
	remoteType: _remoteType;
	cooldown?: number;
}

interface RouteParam {
	endPoint: string;
	secure: true;
	remoteType: _remoteType;
	middleware: Middleware | false;
}

//{Custom Classes}-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

/**
 * Represents a node in a numeric tree structure.
 *
 * @property value - Holds the information of the current node.
 * @property children - Contains all child subtrees (TreeNode instances).
 *
 * @method addChild - Adds a new child node (TreeNode).
 * @method getChild - Retrieves a child node by its name.
 */
class TreeNode {
	constructor(
		public value: Route,
		public children: { [endPoint: string]: TreeNode } = {},
	) {}

	/**
	 * Adds a child node to the current node.
	 * @param child - The TreeNode to be added as a child.
	 */
	addChild(child: TreeNode) {
		this.children[child.value.name] = child;
	}

	/**
	 * Returns the child node with the specified name.
	 * @param name - The name of the child node to retrieve.
	 * @returns The TreeNode corresponding to the name, or undefined if not found.
	 */
	getChild(name: string): TreeNode | undefined {
		return this.children[name];
	}
}

/**
 * Handles middleware execution with client-side cooldown and per-player logging.
 *
 * @property log - Stores the last usage time of each player (by UserId).
 * @property clientSideCooldown - The cooldown duration (in seconds or milliseconds) before a player can reuse the middleware.
 * @property middlewares - An array of callback functions to be executed for each middleware call.
 */
export class Middleware {
	log: { [playerId: number]: RouteLog } = {}; // playerId -> RouteLog
	clientSideCooldown: number;
	middlewares: ((player: Player, ...args: unknown[]) => void)[] = [];

	/**
	 * Creates a new Middleware instance.
	 *
	 * @param clientSideCooldown - Optional cooldown duration between calls (default is 0).
	 * @param callBacks - Optional list of middleware callback functions.
	 */
	constructor(clientSideCooldown = 0, callBacks: ((player: Player, ...args: unknown[]) => void)[] = []) {
		this.clientSideCooldown = clientSideCooldown;
		this.middlewares = callBacks;
	}

	/**
	 * Executes the middleware for the specified player.
	 * Applies cooldown logic and calls all middleware functions.
	 *
	 * @param player - The player invoking the route.
	 * @param currentTime - The current time (usually in seconds or milliseconds).
	 * @param args - Additional arguments passed to each middleware function.
	 * @returns true if execution was successful; false if an error occurred or the player is on cooldown.
	 */
	public execute(player: Player, currentTime: number, ...args: unknown[]): boolean {
		const playerId = player.UserId;

		// First time use
		if (!this.log[playerId]) {
			this.log[playerId] = {
				lastUse: currentTime,
			};
		}

		// Check player cooldown
		else if (currentTime - this.log[playerId].lastUse < this.clientSideCooldown) {
			return false;
		}

		// Update log
		this.log[playerId] = {
			lastUse: currentTime,
		};

		try {
			// Execute all middlewares
			for (const middleware of this.middlewares) {
				middleware(player, ...args);
			}
		} catch (err) {
			warn("Middleware: Error in middleware", err);
			return false;
		}

		return true;
	}
}

/**
 * Represents a network route that can be secured or unsecured, and has associated middleware and remote events.
 *
 * @property remote - The remote event or unreliable remote event associated with this route.
 * @property connection - Optional connection to handle events on the route.
 * @property name - The name of the route.
 * @property secure - Whether the route is secure (using `RemoteEvent`) or unsecured (using `UnreliableRemoteEvent`).
 * @property remoteType - The type of remote interaction (`"event"` or `"function"`).
 * @property middleware - Optional middleware to apply to the route; defaults to `false`.
 */
class Route {
	remote: RemoteEvent | UnreliableRemoteEvent;
	connection: RBXScriptConnection | undefined = undefined;

	/**
	 * Creates a new route instance.
	 *
	 * @param name - The name of the route.
	 * @param secure - Whether the route is secure (true for RemoteEvent, false for UnreliableRemoteEvent). Default is true.
	 * @param remoteType - The type of remote interaction. Either "event" or "function". Default is "event".
	 * @param middleware - Optional middleware to apply to the route. Default is false.
	 */
	constructor(
		public path: string,
		public name: string,
		public secure: boolean = true,
		public remoteType: _remoteType = "event",
		public middleware: false | Middleware = false,
	) {
		let folder = ReplicatedStorage.FindFirstChild("NetworkRemotes") as Folder;

		const pathParts = path.lower().split("/");

		if (path === "root/network" && name === "get-tree") {
			folder = new Instance("Folder", folder);
			folder.Name = "get-tree";
		}

		this.remote = (secure ? new Instance("RemoteEvent") : new Instance("UnreliableRemoteEvent")) as
			| RemoteEvent
			| UnreliableRemoteEvent;
		this.remote.Name = name;
		this.remoteType = remoteType;
		this.remote.Parent = folder;
	}
}

//{Custom Functions}}-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

/**
 * Performs a depth-first search (DFS) on a tree of routes,
 * constructing a simplified representation of the tree.
 *
 * @param node - The current TreeNode being visited.
 * @param path - The path from the root to the current node.
 * @param simplifiedTree - The resulting object that maps full paths to simplified route information.
 */
function depthFirstSearch(node: TreeNode, path: string, simplifiedTree: { [key: string]: SimpleRouteInfo }) {
	const route = node.value;
	const fullPath = path === "" ? route.name : `${path}/${route.name}`;

	const routeInfo: SimpleRouteInfo = {
		secure: route.secure,
		remote: route.remote,
		remoteType: route.remoteType,
	};

	if (route.middleware instanceof Middleware) {
		routeInfo.cooldown = route.middleware.clientSideCooldown;
	}

	simplifiedTree[fullPath] = routeInfo;

	for (const [, childNode] of pairs(node.children)) {
		depthFirstSearch(childNode, fullPath, simplifiedTree);
	}
}

/**
 * Clears the middleware logs for a player when they leave the game.
 * @param record - A dictionary of routes where each route may contain middleware with logs.
 */
function clearRouteLogs(record: { [key: string]: Route }) {
	Players.PlayerRemoving.Connect((player) => {
		for (const [key, value] of pairs(record)) {
			if (value.middleware) {
				delete value.middleware.log[player.UserId];
			}
		}
	});
}

//{Root Route Parameters}-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
const ROOT_ROUTE_NAME: string = "root"; //if you change the name ,you need to change the client too
const ROOT_ROUTE_CD: number = 10; //seconde
const ROOT_ROUTE_SECURE: boolean = true;
const ROOT_ROUTE_MIDDLEWARE: false | Middleware = new Middleware(ROOT_ROUTE_CD);

//{Singleton}-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
/**
 * Singleton class that manages the routing network using a tree structure.
 * @method start - Initializes the network and builds the route tree.
 */
export class Network {
	private static instance: Network;

	constructor(
		private tree: TreeNode,
		private record: { [key: string]: Route } = {},
		private unEditableRoutes: string[] = [],
	) {}

	/**
	 * Initializes the singleton instance of the Network.
	 * - Creates the folder to hold remote instances.
	 * - Defines the root and network routes.
	 * - Builds the route tree.
	 * - Sets up memory cleanup when players leave.
	 * - Sets up a function to send the simplified route tree to clients.
	 */
	public static start() {
		if (this.instance) return;

		// Remotes Folder
		const remotesFolder = new Instance("Folder", ReplicatedStorage);
		remotesFolder.Name = "NetworkRemotes";

		// Root Route & Network Routes
		const rootRoute = new Route("root", ROOT_ROUTE_NAME, ROOT_ROUTE_SECURE, "event", ROOT_ROUTE_MIDDLEWARE);
		const networkRoute = new Route("root/", "network", true, "event", new Middleware(5));
		const getTreeRoute = new Route("root/network", "get-tree", true, "function", new Middleware(5));

		const networkNode = new TreeNode(networkRoute);
		networkNode.addChild(new TreeNode(getTreeRoute));

		const rootNode = new TreeNode(rootRoute);
		rootNode.addChild(networkNode);

		const unEditableRoutes = ["root/network/get-tree"];

		// Create singleton instance
		this.instance = new Network(rootNode, {}, unEditableRoutes);

		// Auto events
		//// Auto memory cleanup
		clearRouteLogs(this.instance.record);

		//// Connect the root route to send the tree to the client
		this.OnInvoke("Connect", "root/network/get-tree", (player: Player) => {
			const simplifiedTree: { [key: string]: SimpleRouteInfo } = {};
			depthFirstSearch(this.instance.tree, "", simplifiedTree);
			return simplifiedTree;
		});
	}

	/**
	 * Navigates the tree structure following the given path string.
	 *
	 * @param path - The full route path (e.g., "root/network/get-tree").
	 * @param createMissing - If true, creates missing TreeNodes along the path.
	 * @returns The TreeNode at the end of the path.
	 *
	 * @throws If the path does not start with 'root' or is too short.
	 * @throws If a node in the path does not exist and createMissing is false.
	 */
	private static traversePath(path: string, createMissing: boolean = false): TreeNode {
		const instance = this.instance ?? this.start();
		let currentNode = instance.tree;

		path = path.lower();
		const pathParts = path.split("/");

		if (pathParts.size() < 1 || pathParts[0] !== ROOT_ROUTE_NAME) {
			throw `Path must start with '${ROOT_ROUTE_NAME}' and have more than 1 part`;
		}

		if (pathParts.size() === 1 && pathParts[0] === "root") {
			return currentNode;
		}

		pathParts.shift();
		let currentPath: string = "root";
		for (const part of pathParts) {
			currentPath += "/" + part;
			let nextNode = currentNode.getChild(part);
			if (!nextNode) {
				if (!createMissing) throw `Route '${part}' does not exist in '${path}'`;
				nextNode = new TreeNode(new Route(currentPath, part, true, "event", new Middleware(1)));
				currentNode.addChild(nextNode);
			}
			currentNode = nextNode;
		}
		return currentNode;
	}

	/**
	 * Retrieves the Route associated with the given path.
	 *
	 * @param path - The full route path (e.g., "root/network/get-tree").
	 * @returns The Route object at the given path.
	 *
	 * @remarks
	 * - If the route has already been cached in the record, it is returned directly.
	 * - Otherwise, the path is traversed to locate and cache the Route.
	 * - Special case: if the path is exactly the root, returns the root route.
	 */
	private static getRoute(path: string) {
		const instance = this.instance ?? this.start();

		if (path === ROOT_ROUTE_NAME) {
			return instance.tree.value;
		}

		if (path in instance.record) {
			return instance.record[path];
		}

		const node = this.traversePath(path);
		instance.record[path] = node.value;
		return node.value;
	}

	/**
	 * Creates and registers a new route at the given path.
	 *
	 * @param path - The full path where the route should be created (e.g., "root/network").
	 * @param routeParam - An object containing route configuration: endPoint name, security, remoteType, and middleware.
	 *
	 * @throws If the path is too short or does not start with 'root'.
	 * @throws If a route with the same endPoint already exists at the target path.
	 *
	 * @remarks
	 * - This will automatically create missing intermediate nodes if needed.
	 * - The route will not be added if it already exists at the given path.
	 */
	public static NewRoute(path: string, routeParam: RouteParam) {
		const parent = this.traversePath(path, true);
		if (parent.getChild(routeParam.endPoint)) {
			throw `Route '${routeParam.endPoint}' already exists at '${path}'`;
		}
		parent.addChild(
			new TreeNode(
				new Route(path, routeParam.endPoint, routeParam.secure, routeParam.remoteType, routeParam.middleware),
			),
		);
	}

	/**
	 * Edits an existing route's configuration at the given path.
	 *
	 * @param path - The full path to the parent route (e.g., "root/network").
	 * @param routeParam - The new route configuration to apply (endPoint, secure flag, remote type, middleware).
	 *
	 * @throws If the network has not been initialized with `Network.start()`.
	 *
	 * @remarks
	 * - If the route is marked as uneditable (e.g., core system routes), it will not be modified.
	 * - If the target route does not exist at the given path, a warning is logged.
	 * - Existing child nodes of the route will be preserved.
	 */
	public static EditRoute(path: string, routeParam: RouteParam) {
		if (!this.instance) {
			throw "ServerNetwork not initialized, please do 'Network.start()'";
		}

		if (path.lower() in this.instance.unEditableRoutes) {
			warn(`You can't edit : '${path}' `);
			return;
		}
		const parent = this.traversePath(path);
		if (!parent.getChild(routeParam.endPoint)) {
			warn(`Route '${routeParam.endPoint}' does not exist at '${path}'`);
			return;
		}
		const childs = parent.children[routeParam.endPoint].children;

		parent.children[routeParam.endPoint] = new TreeNode(
			new Route(path, routeParam.endPoint, routeParam.secure, routeParam.remoteType, routeParam.middleware),
			childs,
		);
	}

	/**
	 * Connects a callback function to a remote event at the specified path.
	 *
	 * @param eventType - The type of event listener to bind (usually "Connect").
	 * @param path - The full route path (e.g., "root/chat/send-message").
	 * @param callback - The function to execute when the event is triggered.
	 *
	 * @throws If the network has not been initialized with `Network.start()`.
	 * @throws If the route at the given path is not an event.
	 * @throws If the route is already connected to an event listener.
	 *
	 * @remarks
	 * - This method also checks and runs the middleware (if defined) before calling the final callback.
	 * - The middleware can cancel execution if conditions (like cooldown) are not met.
	 * - The eventType is typically "Connect" and refers to the `.OnServerEvent.Connect(...)` method.
	 */
	public static OnEvent(eventType: _eventType, path: string, callback: (player: Player, ...args: unknown[]) => void) {
		if (!this.instance) {
			throw "ServerNetwork not initialized, please do 'Network.start()'";
		}

		this.start();
		const route = this.getRoute(path);
		if (route.remoteType !== "event") {
			throw `Route '${path}' is not a event`;
		}
		if (route.connection) {
			throw `Route '${path}' is already connected`;
		}

		route.connection = route.remote.OnServerEvent[eventType]((player: Player, ...agrs: unknown[]) => {
			const currentTime = os.clock();
			const middleware = route.middleware;

			if (middleware) {
				if (!middleware.execute(player, currentTime, ...agrs)) {
					return;
				}
			}

			callback(player, ...agrs);
		});
	}

	/**
	 * Invokes a server-side function when the event is triggered, executing the callback with the player's data.
	 *
	 * @param eventType - The type of the event (e.g., "event", "function").
	 * @param path - The full route path (e.g., "root/chat/private").
	 * @param callback - The callback function to invoke when the event is fired. It will receive the player and any other arguments.
	 *
	 * @throws If the route is not initialized with `Network.start()`.
	 * @throws If the route type is not "function".
	 * @throws If the route is already connected.
	 *
	 * @remarks
	 * - This method listens for function invocations and sends the result back to the client.
	 * - The callback function should return a value that will be sent to the client.
	 * - This method supports both `RemoteEvent` and `UnreliableRemoteEvent`.
	 */
	public static OnInvoke(
		eventType: _eventType,
		path: string,
		callback: (player: Player, ...args: unknown[]) => unknown,
	) {
		if (!this.instance) {
			throw "ServerNetwork not initialized, please do 'Network.start()'";
		}
		const route = this.getRoute(path);
		if (route.remoteType !== "function") {
			throw `Route '${path}' is not a function`;
		}
		if (route.connection) {
			throw `Route '${path}' is already connected`;
		}

		// Connection
		route.connection = route.remote.OnServerEvent[eventType]((player: Player, ...args) => {
			// Get the time
			const currentTime = os.clock();
			const middleware = route.middleware;

			// Execute middleware
			if (middleware) {
				if (!middleware.execute(player, currentTime, ...args)) {
					return;
				}
			}

			// Execute callback and return the result
			const result = callback(player, ...args);
			if (route.remote.IsA("RemoteEvent")) {
				route.remote.FireClient(player, result);
			} else if (route.remote.IsA("UnreliableRemoteEvent")) {
				route.remote.FireClient(player, result);
			}
		});
	}

	/**
	 * Disconnects the event listener associated with the specified route path.
	 *
	 * @param path - The full route path (e.g., "root/chat/send-message").
	 *
	 * @remarks
	 * - This method safely disconnects the existing connection (if any) for the route.
	 * - If no connection is found, nothing happens.
	 * - This is useful for cleaning up or resetting a route listener at runtime.
	 */
	public static Disconnect(path: string) {
		this.start();
		const route = this.getRoute(path);
		if (route.connection) {
			route.connection.Disconnect();
			route.connection = undefined;
		}
	}

	/**
	 * Fires a remote event to a specific client.
	 *
	 * @param path - The full route path (e.g., "root/chat/new-message").
	 * @param player - The player to send the event to.
	 * @param args - The arguments to pass to the client.
	 *
	 * @throws If the route is not of type "event".
	 *
	 * @remarks
	 * - This method supports both `RemoteEvent` and `UnreliableRemoteEvent`.
	 * - It ensures the route is valid and of the correct type before sending.
	 * - Useful for sending data or signals from the server to one player.
	 */
	public static FireClient(path: string, player: Player, ...args: unknown[]) {
		this.start();
		const route = this.getRoute(path);
		if (route.remoteType !== "event") {
			throw `Route '${path}' is not a event`;
		}
		const remote = route.remote as RemoteEvent | UnreliableRemoteEvent;

		if (remote.IsA("RemoteEvent")) {
			remote.FireClient(player, ...args);
		} else if (remote.IsA("UnreliableRemoteEvent")) {
			remote.FireClient(player, ...args);
		}
	}

	/**
	 * Fires a remote event to all connected clients.
	 *
	 * @param path - The full route path (e.g., "root/chat/broadcast").
	 * @param args - The arguments to send to all clients.
	 *
	 * @throws If the route is not of type "event".
	 *
	 * @remarks
	 * - Works with both `RemoteEvent` and `UnreliableRemoteEvent`.
	 * - Ensures the route exists and is of the correct type before firing.
	 * - Useful for broadcasting data to every player in the game.
	 */
	public static FireAllClients(path: string, ...args: unknown[]) {
		this.start();
		const route = this.getRoute(path);
		if (route.remoteType !== "event") {
			throw `Route '${path}' is not a event`;
		}
		const remote = route.remote as RemoteEvent | UnreliableRemoteEvent;

		if (remote.IsA("RemoteEvent")) {
			remote.FireAllClients(...args);
		} else if (remote.IsA("UnreliableRemoteEvent")) {
			remote.FireAllClients(...args);
		}
	}

	/**
	 * Fires a remote event to a list of specified players.
	 *
	 * @param path - The full route path (e.g., "root/chat/private").
	 * @param players - The list of players to whom the event will be sent.
	 * @param args - The arguments to send to the players.
	 *
	 * @throws If the route is not of type "event".
	 *
	 * @remarks
	 * - Works with both `RemoteEvent` and `UnreliableRemoteEvent`.
	 * - Sends the event only to players currently in the game (based on the `Players` list).
	 * - Useful for targeting specific players for communication or game mechanics.
	 */
	public static FireClientsInList(path: string, players: Player[], ...args: unknown[]) {
		this.start();
		const route = this.getRoute(path);
		if (route.remoteType !== "event") {
			throw `Route '${path}' is not a event`;
		}
		const remote = route.remote as RemoteEvent | UnreliableRemoteEvent;

		for (const player of players) {
			if (Players.GetPlayers().includes(player)) {
				if (remote.IsA("RemoteEvent")) {
					remote.FireClient(player, ...args);
				}
				if (remote.IsA("UnreliableRemoteEvent")) {
					remote.FireClient(player, ...args);
				}
			}
		}
	}
}
