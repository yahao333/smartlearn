import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { AppTable } from './AppTable';

function isTagElement(node: React.ReactNode, tag: string): node is React.ReactElement {
  return React.isValidElement(node) && typeof node.type === 'string' && node.type === tag;
}

function pickChildren(node: React.ReactNode): React.ReactNode[] {
  if (!React.isValidElement(node)) return [];
  return React.Children.toArray(node.props?.children);
}

function extractTableModel(tableChildren: React.ReactNode) {
  const children = React.Children.toArray(tableChildren);
  const thead = children.find((n) => isTagElement(n, 'thead'));
  const tbody = children.find((n) => isTagElement(n, 'tbody'));

  const headRow = thead ? pickChildren(thead).find((n) => isTagElement(n, 'tr')) : undefined;
  const headCells = headRow
    ? pickChildren(headRow).filter((n) => isTagElement(n, 'th')).map((th) => pickChildren(th))
    : [];

  const bodyRows = tbody ? pickChildren(tbody).filter((n) => isTagElement(n, 'tr')) : [];
  const rows = bodyRows.map((tr) => {
    const tds = pickChildren(tr).filter((n) => isTagElement(n, 'td'));
    return tds.map((td) => pickChildren(td));
  });

  return {
    head: headCells.map((cell, idx) => <React.Fragment key={idx}>{cell}</React.Fragment>),
    rows: rows.map((row, rIdx) =>
      row.map((cell, cIdx) => <React.Fragment key={`${rIdx}-${cIdx}`}>{cell}</React.Fragment>)
    ),
  };
}

export function MarkdownRenderer({ markdown }: { markdown: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        table: ({ children }) => {
          try {
            const model = extractTableModel(children);
            if (model.head.length === 0 && model.rows.length === 0) {
              return <table>{children}</table>;
            }
            return (
              <div className="my-6">
                <AppTable head={model.head} rows={model.rows} />
              </div>
            );
          } catch (e) {
            console.warn('⚠️ Markdown 表格解析失败，回退到默认渲染:', e);
            return <table>{children}</table>;
          }
        },
        a: ({ href, children }) => (
          <a href={href} target="_blank" rel="noopener noreferrer" className="text-blue-700 underline">
            {children}
          </a>
        ),
      }}
    >
      {markdown}
    </ReactMarkdown>
  );
}
