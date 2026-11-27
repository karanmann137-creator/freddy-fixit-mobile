// Where the chat screens live. Other screens (estimates, job detail, the Available
// tab) link here through these, so a path is spelled once.
//   /client/chat/<jobId>                        JobChat, client
//   /contractor/chat/<jobId>                    JobChat, contractor
//   /client/chat/bid/<requestId>/<contractorId> BidChat, client (one thread per pro who bid)
//   /contractor/chat/bid/<requestId>            BidChat, contractor (the thread is always mine)
import type { ChatRole } from "./webChat";

export const jobChatHref = (role: ChatRole, jobId: string) =>
  (role === "client" ? "/client/chat/" : "/contractor/chat/") + encodeURIComponent(jobId);

export const bidChatHref = (role: ChatRole, requestId: string, contractorId: string) =>
  role === "client"
    ? "/client/chat/bid/" + encodeURIComponent(requestId) + "/" + encodeURIComponent(contractorId)
    : "/contractor/chat/bid/" + encodeURIComponent(requestId);
