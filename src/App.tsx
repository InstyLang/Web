import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "./lib/auth";

export default function App() {
  const { user, loading, logout } = useAuth();
  return (
    <>
      <nav className="nav">
        <NavLink to="/" className="brand">
          Insty<span>::</span>Registry
        </NavLink>
        <NavLink to="/" end>
          Search
        </NavLink>
        {user && <NavLink to="/dashboard">Dashboard</NavLink>}
        <div className="spacer" />
        {!loading && !user && (
          <>
            <NavLink to="/login">Log in</NavLink>
            <NavLink to="/signup">Sign up</NavLink>
          </>
        )}
        {user && (
          <>
            <span className="tag">@{user.accountName}</span>
            <a
              href="#"
              onClick={(e) => {
                e.preventDefault();
                void logout();
              }}
            >
              Log out
            </a>
          </>
        )}
      </nav>
      <Outlet />
      <footer className="footer">
        Insty Registry <span className="sep">::</span> publish, resolve, install
      </footer>
    </>
  );
}
