import { createElement as h, useState } from "react";
import { createRoot } from "react-dom/client";
import { Button, ButtonGroup, Sheet } from "zanni-react";

function Demo() {
  const [open, setOpen] = useState(false);
  return h(
    "div",
    null,
    h(ButtonGroup, { label: "Actions" }, h(Button, { variant: "accent", onClick: () => setOpen(true) }, "Open the sheet"), h(Button, { variant: "quiet" }, "Quiet")),
    h(Sheet, { open, onClose: () => setOpen(false), title: "A sheet", label: "A sheet" }, h("p", null, "Served from the immutable bundle."))
  );
}

createRoot(document.getElementById("root")).render(h(Demo));
