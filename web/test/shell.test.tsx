import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { App } from "../src/app";

it("names the app figaro web", () => {
  render(<App />);
  expect(screen.getByText("figaro web")).toBeTruthy();
});
