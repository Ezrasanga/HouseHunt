import Icon from "../common/Icon";

const amenitiesList = [
  ["wifi", "Wi-Fi"],
  ["parking", "Parking"],
  ["water", "Water"],
  ["electricity", "Electricity"],
  ["security", "Security"],
  ["balcony", "Balcony"],
  ["furnished", "Furnished"],
  ["petFriendly", "Pet friendly"],
];

const budgetLabels = {
  low: "Below KSh 15,000",
  mid: "KSh 15,000–35,000",
  high: "Above KSh 35,000",
};

export default function SearchBar({
  search, setSearch, budget, setBudget, ptype, setPtype,
  county = "", setCounty = () => {},
  town = "", setTown = () => {},
  bedrooms = "", setBedrooms = () => {},
  amenities = [], toggleAmenity = () => {},
  sort = "featured", setSort = () => {},
  onRemoveFilter = () => {}, onClearFilters = () => {},
  onSearch = () => {},
}) {
  const activeFilters = [
    search.trim() && { key: "search", label: `Search: ${search.trim()}` },
    budget && { key: "budget", label: budgetLabels[budget] || budget },
    ptype && { key: "type", label: ptype },
    county.trim() && { key: "county", label: `County: ${county.trim()}` },
    town.trim() && { key: "town", label: `Town: ${town.trim()}` },
    bedrooms !== "" && { key: "bedrooms", label: bedrooms === "0" ? "Studio" : `${bedrooms} bedroom${bedrooms === "1" ? "" : "s"}` },
    ...amenities.map(value => ({
      key: `amenity:${value}`,
      label: amenitiesList.find(([name]) => name === value)?.[1] || value,
    })),
    sort !== "featured" && {
      key: "sort",
      label: `Sort: ${sort === "newest" ? "Newest" : "Recently confirmed"}`,
    },
  ].filter(Boolean);

  return (
    <>
      <div className="sbar">
        <label className="search-field search-location">
          <Icon name="mapPin" />
          <input aria-label="Search by location or property name" placeholder="Search location or property name" value={search} onChange={e => setSearch(e.target.value)} />
        </label>
        <label className="search-field">
          <Icon name="mapPin" />
          <input aria-label="County" placeholder="County" value={county} onChange={e => setCounty(e.target.value)} />
        </label>
        <label className="search-field">
          <Icon name="mapPin" />
          <input aria-label="Town" placeholder="Town" value={town} onChange={e => setTown(e.target.value)} />
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
        <label className="search-field">
          <Icon name="home" />
          <select aria-label="Bedrooms" value={bedrooms} onChange={e => setBedrooms(e.target.value)}>
            <option value="">Any bedrooms</option>
            <option value="0">Studio / 0 bedrooms</option>
            {[1, 2, 3, 4].map(count => <option key={count} value={count}>{count} bedroom{count === 1 ? "" : "s"}</option>)}
          </select>
        </label>
        <label className="search-field">
          <Icon name="sliders" />
          <select aria-label="Sort listings" value={sort} onChange={e => setSort(e.target.value)}>
            <option value="featured">Featured first</option>
            <option value="newest">Newest listings</option>
            <option value="recently-confirmed">Recently confirmed available</option>
          </select>
        </label>
        <fieldset className="amenity-filter">
          <legend>Amenities</legend>
          {amenitiesList.map(([value, label]) => (
            <label key={value}>
              <input type="checkbox" checked={amenities.includes(value)} onChange={() => toggleAmenity(value)} />
              <span>{label}</span>
            </label>
          ))}
        </fieldset>
        <button className="search-submit" type="button" onClick={onSearch}>
          <Icon name="search" /> Search
        </button>
      </div>
      {activeFilters.length > 0 && (
        <div className="active-filters" aria-label="Active search filters">
          <span className="active-filters-title">Filters:</span>
          {activeFilters.map(filter => (
            <button
              key={filter.key}
              type="button"
              className="filter-chip"
              onClick={() => onRemoveFilter(filter.key)}
              aria-label={`Remove ${filter.label} filter`}
            >
              {filter.label}<span aria-hidden="true"> ×</span>
            </button>
          ))}
          <button type="button" className="clear-active-filters" onClick={onClearFilters}>Clear all</button>
        </div>
      )}
    </>
  );
}
