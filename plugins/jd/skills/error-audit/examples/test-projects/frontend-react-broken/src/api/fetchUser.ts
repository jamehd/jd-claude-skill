// VIOLATION frontend/04: no error handling on fetch
export async function fetchUser(id: string) {
  const res = await fetch(`/api/users/${id}`);
  return res.json();
}
