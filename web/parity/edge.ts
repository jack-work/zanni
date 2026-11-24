import { createServer, connect, type Server } from "node:net";

export function edgeProxy(listen: string, door: string, user: string): Promise<Server> {
  const server = createServer((client) => {
    const upstream = connect(door);
    let head = Buffer.alloc(0);
    let injected = false;
    client.on("data", (chunk) => {
      if (injected) return void upstream.write(chunk);
      head = Buffer.concat([head, chunk]);
      const end = head.indexOf("\r\n\r\n");
      if (end < 0) return;
      const first = head.indexOf("\r\n");
      const lines = [head.subarray(0, first), Buffer.from(`Remote-User: ${user}`), head.subarray(first + 2)];
      upstream.write(Buffer.concat([lines[0]!, Buffer.from("\r\n"), lines[1]!, Buffer.from("\r\n"), lines[2]!]));
      injected = true;
    });
    upstream.on("data", (d) => client.write(d));
    upstream.on("close", () => client.destroy());
    upstream.on("error", () => client.destroy());
    client.on("close", () => upstream.destroy());
    client.on("error", () => upstream.destroy());
  });
  return new Promise((resolve) => server.listen(listen, () => resolve(server)));
}
