import { createElement as h, useState } from "react";
import { createRoot } from "react-dom/client";
import { QueueBoard } from "zanni-react";

const data = await fetch("../web/test/fixtures/deploys.json").then((r) => r.json());

function Demo() {
  const [env, setEnv] = useState("dev");
  const [since, setSince] = useState("7d");
  return h(QueueBoard, { data: { ...data, env }, env, onEnv: setEnv, since, onSince: setSince });
}

createRoot(document.getElementById("root")).render(h(Demo));
