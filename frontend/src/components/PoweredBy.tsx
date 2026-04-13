export default function PoweredBy({ color }: { color?: string }) {
  return (
    <p
      className="text-center text-xs mt-8"
      style={{ color: color ?? "inherit", opacity: 0.3 }}
    >
      Gerenciado por PokerClub
    </p>
  );
}
