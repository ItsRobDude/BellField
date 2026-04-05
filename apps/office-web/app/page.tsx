const plannedOfficeAreas = [
  'Dashboard',
  'Search',
  'Accounts',
  'Locations',
  'Jobs',
  'Dispatch',
  'Estimates',
  'Invoices',
  'Inventory',
  'Purchasing',
  'Reports',
  'Settings'
];

export default function OfficeHomePage() {
  return (
    <main style={{ fontFamily: 'Arial, sans-serif', margin: '2rem', maxWidth: '60rem' }}>
      <h1>BellField Office Dashboard Placeholder</h1>
      <p>
        This is the TypeScript-first office shell. It intentionally contains no business workflows,
        auth, or feature logic yet.
      </p>
      <section>
        <h2>Planned Office Areas</h2>
        <ul>
          {plannedOfficeAreas.map((area) => (
            <li key={area}>{area}</li>
          ))}
        </ul>
      </section>
      <section>
        <h2>Module-ready Folders</h2>
        <p>
          Use <code>src/modules</code> for future page modules, <code>src/components</code> for shared UI,
          and <code>src/lib</code> for app-level utilities.
        </p>
      </section>
    </main>
  );
}
