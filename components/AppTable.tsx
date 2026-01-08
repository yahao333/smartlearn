import React from 'react';

export type AppTableModel = {
  head: React.ReactNode[];
  rows: React.ReactNode[][];
};

export function AppTable({ head, rows }: AppTableModel) {
  return (
    <div className="w-full overflow-x-auto rounded-xl border border-gray-200 bg-white">
      <table className="w-full border-collapse text-sm">
        <thead className="bg-gray-50">
          <tr>
            {head.map((cell, idx) => (
              <th
                key={idx}
                className="whitespace-nowrap px-4 py-3 text-left font-semibold text-gray-700 border-b border-gray-200"
              >
                {cell}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rIdx) => (
            <tr key={rIdx} className={rIdx % 2 === 0 ? 'bg-white' : 'bg-gray-50/40'}>
              {row.map((cell, cIdx) => (
                <td key={cIdx} className="align-top px-4 py-3 text-gray-700 border-b border-gray-100">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

