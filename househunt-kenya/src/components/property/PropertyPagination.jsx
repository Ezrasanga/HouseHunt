import Pagination from "../common/Pagination";

export default function PropertyPagination(props) {
  return <Pagination {...props} ariaLabel="Property result pages" totalLabel="homes" />;
}
