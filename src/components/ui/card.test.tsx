import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Card, CardHeader, CardTitle, CardBody, CardFooter } from "./card";

describe("Card", () => {
  it("renders Card with expected classes", () => {
    render(<Card data-testid="card">Content</Card>);
    const card = screen.getByTestId("card");
    expect(card.className).toMatch(/rounded-lg/);
    expect(card.className).toMatch(/border-border-default\/50/);
    expect(card.className).toMatch(/bg-surface/);
    expect(card.className).toMatch(/shadow-sm/);
  });

  it("renders CardHeader with border-bottom", () => {
    render(<CardHeader data-testid="header">Header</CardHeader>);
    const header = screen.getByTestId("header");
    expect(header.className).toMatch(/border-b/);
    expect(header.className).toMatch(/px-4 py-3/);
  });

  it("renders CardTitle with text-h3", () => {
    render(<CardTitle>Title</CardTitle>);
    const title = screen.getByText("Title");
    expect(title.tagName).toBe("H3");
    expect(title.className).toMatch(/text-\[15px\]/);
    expect(title.className).toMatch(/font-semibold/);
  });

  it("renders CardBody with padding", () => {
    render(<CardBody data-testid="body">Body</CardBody>);
    const body = screen.getByTestId("body");
    expect(body.className).toMatch(/p-4/);
  });

  it("renders CardFooter with border-top", () => {
    render(<CardFooter data-testid="footer">Footer</CardFooter>);
    const footer = screen.getByTestId("footer");
    expect(footer.className).toMatch(/border-t/);
    expect(footer.className).toMatch(/px-4 py-3/);
  });

  it("renders all subcomponents together", () => {
    render(
      <Card>
        <CardHeader>
          <CardTitle>T</CardTitle>
        </CardHeader>
        <CardBody>B</CardBody>
        <CardFooter>F</CardFooter>
      </Card>,
    );
    expect(screen.getByText("T")).toBeTruthy();
    expect(screen.getByText("B")).toBeTruthy();
    expect(screen.getByText("F")).toBeTruthy();
  });

  it("forwards refs", () => {
    let cardRef: HTMLDivElement | null = null;
    let headerRef: HTMLDivElement | null = null;
    let titleRef: HTMLHeadingElement | null = null;
    let bodyRef: HTMLDivElement | null = null;
    let footerRef: HTMLDivElement | null = null;

    render(
      <Card
        ref={(el) => {
          cardRef = el;
        }}
      >
        <CardHeader
          ref={(el) => {
            headerRef = el;
          }}
        >
          <CardTitle
            ref={(el) => {
              titleRef = el;
            }}
          >
            Title
          </CardTitle>
        </CardHeader>
        <CardBody
          ref={(el) => {
            bodyRef = el;
          }}
        >
          Body
        </CardBody>
        <CardFooter
          ref={(el) => {
            footerRef = el;
          }}
        >
          Footer
        </CardFooter>
      </Card>,
    );

    expect(cardRef).toBeTruthy();
    expect(headerRef).toBeTruthy();
    expect(titleRef).toBeTruthy();
    expect(bodyRef).toBeTruthy();
    expect(footerRef).toBeTruthy();
  });
});
