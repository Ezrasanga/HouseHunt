export default function SearchBar({ search, setSearch, budget, setBudget, ptype, setPtype }) {
  return (
    <div className="sbar">
      <input placeholder="🔍 Search location or name…" value={search} onChange={e => setSearch(e.target.value)} />
      <select value={budget} onChange={e => setBudget(e.target.value)}>
        <option value="">Any Budget</option>
        <option value="low">Below KSh 15,000</option>
        <option value="mid">KSh 15,000 – 35,000</option>
        <option value="high">Above KSh 35,000</option>
      </select>
      <select value={ptype} onChange={e => setPtype(e.target.value)}>
        <option value="">Any Type</option>
        {['Bedsitter', 'Room', 'Apartment', 'House', 'Penthouse'].map(t => <option key={t}>{t}</option>)}
      </select>
    </div>
  );
}
