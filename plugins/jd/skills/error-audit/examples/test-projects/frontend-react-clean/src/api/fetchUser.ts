export async function fetchUser(id: string) {
  try {
    const res = await fetch(`/api/users/${id}`);
    if (!res.ok) throw new Error(`fetchUser ${id}: HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    console.error('fetchUser.failed', { id, err });
    throw err;
  }
}
