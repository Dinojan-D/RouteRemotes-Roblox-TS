//{Modules}
import { Network } from "shared/RouteRemotesModules/ClientNetwork";

Network.start();

//RemoteEvent test
Network.FireServer("root/communication/message", "Hello", "Hi");

Network.OnEvent("Connect", "root/communication/message", (...args: unknown[]) => {
	const msg1 = args[0] as string;
	const msg2 = args[1] as string;
	print(`[Client Event "root/communication/message"] > Message from the server : ${msg1} , ${msg2} `);
});

//RemoteFunction test
const result = Network.InvokeServer("root/additions", 5, 100, 100);
print("[Client Result of Invoke ] voici le resultat du serveur", result);
