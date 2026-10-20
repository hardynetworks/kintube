import { Link } from 'react-router-dom';
import { Empty } from '../components/ui.jsx';

export default function NotFound() {
  return (
    <div className="page">
      <Empty title="Page not found" action={<Link to="/" className="btn btn--primary">Back home</Link>}>
        That link doesn't go anywhere.
      </Empty>
    </div>
  );
}
