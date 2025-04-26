//{Modules}
import { Middleware, Network } from "shared/RouteRemotesModules/ServerNetwork";

Network.start();

//RemoteEvent Test

Network.NewRoute("root/communication/message", {
	endPoint: "additions",
	secure: true,
	remoteType: "function",
	middleware: new Middleware(1, [
		function (player: Player, msg1, msg2) {
			print(
				`[Server Middleware onEvent [root/communication/message] ] > Message from ${player.Name} : ${msg1} , ${msg2}`,
			);
		},

		function (player: Player, msg1, msg2) {
			if (typeOf(msg1) !== "string") {
				throw "string!!!";
			}
			if (typeOf(msg2) !== "string") {
				throw "string!!!";
			}
		},
	]),
});

Network.OnEvent("Connect", "root/communication/message", (player: Player, ...args: unknown[]) => {
	const msg1 = args[0] as string;
	const msg2 = args[1] as string;

	print(`[Server onEvent "root/communication/message"] > Message from ${player.Name} : ${msg1} , ${msg2} `);

	Network.FireClient("root/communication/message", player, `Hello ${player.Name}`, msg2);
	Network.FireClientsInList("root/communication/message", [player], "Hello player in list ", msg2);
	Network.FireAllClients("root/communication/message", "Hello everyone", msg2);
});

//RemoteFunction Test (Only ServerInvoke)
Network.NewRoute("root", {
	endPoint: "additions",
	secure: true,
	remoteType: "function",
	middleware: new Middleware(1, [
		function (player: Player, number1, number2) {
			if (typeOf(number1) !== "number") {
				throw "number!!!";
			}
			if (typeOf(number2) !== "number") {
				throw "number!!!";
			}
		},
	]),
});

Network.OnInvoke("Connect", "root/additions", (player: Player, number1, number2) => {
	const _number1 = number1 as number;
	const _number2 = number2 as number;

	print(`[Server OnInvoke]: ${number1}+${number2} calcule en cours ... `);
	return _number1 + _number2;
});
