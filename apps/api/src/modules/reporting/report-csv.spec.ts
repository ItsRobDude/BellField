import { toCsv, type CsvColumn } from './report-csv';

type Row = { name: string | number | null; amount: number };

const columns: CsvColumn<Row>[] = [
  { header: 'Name', value: (row) => row.name },
  { header: 'Amount', value: (row) => row.amount }
];

describe('report-csv', () => {
  it('writes a header row and comma-joined cells', () => {
    const csv = toCsv(columns, [{ name: 'Acme', amount: 100 }]);
    expect(csv.split('\n')).toEqual(['Name,Amount', 'Acme,100']);
  });

  it('neutralizes formula-leading text cells but leaves numbers numeric', () => {
    const csv = toCsv(columns, [
      { name: '=SUM(A1)', amount: -25 }, // formula text → quoted out; -25 is a number, stays numeric
      { name: '@cmd', amount: 5 },
      { name: '+1', amount: 0 },
      { name: '-bad', amount: 10 },
      { name: 'Acme', amount: 100 }
    ]);
    const lines = csv.split('\n');
    expect(lines[1]).toBe("'=SUM(A1),-25");
    expect(lines[2]).toBe("'@cmd,5");
    expect(lines[3]).toBe("'+1,0");
    expect(lines[4]).toBe("'-bad,10");
    expect(lines[5]).toBe('Acme,100');
  });

  it('quotes and neutralizes a formula cell that also contains a comma', () => {
    const csv = toCsv(
      [{ header: 'Name', value: (row: Row) => row.name }],
      [{ name: '=a,b', amount: 0 }]
    );
    expect(csv.split('\n')[1]).toBe(`"'=a,b"`);
  });

  it('renders null as an empty cell', () => {
    const csv = toCsv(columns, [{ name: null, amount: 7 }]);
    expect(csv.split('\n')[1]).toBe(',7');
  });
});
