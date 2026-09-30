import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Table, THead, TBody, Tr, Th, Td } from "./table";

describe("Table", () => {
  it("renders header + body rows", () => {
    render(
      <Table>
        <THead>
          <Tr>
            <Th>Name</Th>
          </Tr>
        </THead>
        <TBody>
          <Tr>
            <Td>Alpha</Td>
          </Tr>
        </TBody>
      </Table>,
    );
    expect(screen.getByText("Name")).toBeTruthy();
    expect(screen.getByText("Alpha")).toBeTruthy();
  });
});
