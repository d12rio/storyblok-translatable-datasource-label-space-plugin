// The auth handler is a Node (req, res) listener, so it lives in the Pages Router.
import { handleConnect } from "@/auth";

export const config = { api: { externalResolver: true } };

export default handleConnect;
