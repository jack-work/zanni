import { Fragment, memo, type ReactNode } from "react";
import { nodi, type Block, type Span } from "./zanni";

export function Plain({ text }: { text: string }) {
  return (
    <>
      {nodi.reveal(text).map((p, i) =>
        p.mark !== undefined ? (
          <span key={i} className="nodi-ctl">
            {p.mark}
          </span>
        ) : (
          <Fragment key={i}>{p.plain}</Fragment>
        ),
      )}
    </>
  );
}

function Spans({ spans }: { spans: Span[] }): ReactNode {
  return (
    <>
      {spans.map((s, i) => {
        switch (s.kind) {
          case "text":
            return <Plain key={i} text={s.text} />;
          case "code":
            return (
              <code key={i} className="nodi-code">
                <Plain text={s.text} />
              </code>
            );
          case "a":
            return (
              <a key={i} className="nodi-a" href={s.href} rel="noopener noreferrer" target="_blank">
                <Plain text={s.text} />
              </a>
            );
          case "b":
            return (
              <strong key={i}>
                <Spans spans={s.spans} />
              </strong>
            );
          case "i":
            return (
              <em key={i}>
                <Spans spans={s.spans} />
              </em>
            );
        }
      })}
    </>
  );
}

function Inline({ text }: { text: string }) {
  return <Spans spans={nodi.spans(text)} />;
}

function same(a: Block, b: Block): boolean {
  return a === b || JSON.stringify(a) === JSON.stringify(b);
}

export const BlockView = memo(function BlockView({ block }: { block: Block }) {
  switch (block.kind) {
    case "table":
      return (
        <div className="nodi-table-wrap">
          <table className="nodi-table">
            <thead>
              <tr>
                {block.head.map((t, c) => (
                  <th key={c} data-align={block.align[c] || undefined}>
                    <Inline text={t} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((r, i) => (
                <tr key={i}>
                  {r.map((t, c) => (
                    <td key={c} data-align={block.align[c] || undefined}>
                      <Inline text={t} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case "code":
      return (
        <pre className="nodi-pre">
          <code>
            <Plain text={block.text} />
          </code>
        </pre>
      );
    case "h": {
      const Tag = block.level < 3 ? "h3" : "h4";
      return (
        <Tag className="nodi-h">
          <Inline text={block.text} />
        </Tag>
      );
    }
    case "hr":
      return <hr className="nodi-hr" />;
    case "ul":
    case "ol": {
      const Tag = block.kind;
      return (
        <Tag className="nodi-list" {...(block.kind === "ol" && block.start !== 1 ? { start: block.start } : {})}>
          {block.items.map((t, i) => (
            <li key={i}>
              <Inline text={t} />
            </li>
          ))}
        </Tag>
      );
    }
    case "quote":
      return (
        <blockquote className="nodi-quote">
          <Inline text={block.text} />
        </blockquote>
      );
    case "p":
      return (
        <p className="nodi-p">
          <Inline text={block.text} />
        </p>
      );
  }
}, (a, b) => same(a.block, b.block));
