import Icon from "../common/Icon";

export default function SearchBar({ search, setSearch, budget, setBudget, ptype, setPtype, onSearch = () => {} }) {
  return (
    <div className="sbar">
      <label className="search-field search-location">
        <Icon name="mapPin" />
        <input aria-label="Search by location or property name" placeholder="Search location or property name" value={search} onChange={e => setSearch(e.target.value)} />
      </label>
      <label className="search-field">
        <Icon name="home" />
        <select aria-label="Property type" value={ptype} onChange={e => setPtype(e.target.value)}>
          <option value="">Property type</option>
          {['Bedsitter', 'Room', 'Apartment', 'House', 'Penthouse'].map(t => <option key={t}>{t}</option>)}
        </select>
      </label>
      <label className="search-field">
        <Icon name="sliders" />
        <select aria-label="Budget" value={budget} onChange={e => setBudget(e.target.value)}>
          <option value="">Any budget</option>
          <option value="low">Below KSh 15,000</option>
          <option value="mid">KSh 15,000 – 35,000</option>
          <option value="high">Above KSh 35,000</option>
        </select>
      </label>
      <button className="search-submit" type="button" onClick={onSearch}>
        <Icon name="search" /> Search
      </button>
    </div>
  );
}
