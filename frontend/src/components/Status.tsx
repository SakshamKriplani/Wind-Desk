export function Loading({ what }: { what: string }) {
  return <p className="state" role="status">Loading {what}…</p>;
}

export function Failed({ message }: { message: string }) {
  return (
    <p className="state error" role="alert">
      Couldn't load this view: {message}. Check that the API is running, then reload the page.
    </p>
  );
}
