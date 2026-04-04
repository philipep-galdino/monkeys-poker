from decimal import Decimal

from app.models import ChipDenomination


def _parse_blinds(blinds_info: str) -> tuple[float, float]:
    """Parse string like '1/2' or '5/10' into small blind and big blind values. Fallback to 0,0."""
    try:
        parts = blinds_info.split("/")
        if len(parts) >= 2:
            sb = float(parts[0].strip())
            bb = float(parts[1].strip())
            return sb, bb
    except (ValueError, IndexError):
        pass
    return 0.0, 0.0


def calculate_buyin_kit(
    denominations: list[ChipDenomination],
    amount: float,
    blinds_info: str,
    table_limit: int = 9,
) -> tuple[dict, dict]:
    """
    Calcula um Kit de Buy-in inteligente focado em jogabilidade.
    Prioriza ~30 Big Blinds em fichas pequenas e mistura o restante com fichas grandes.
    """
    sb_val, bb_val = _parse_blinds(blinds_info)
    table_limit = max(1, table_limit)
    
    # Ordena denominações ativas por valor (crescente)
    active = sorted(
        [d for d in denominations if d.active],
        key=lambda d: float(d.value)
    )
    
    if not active:
        return {
            "items": [],
            "total_value": 0.0,
            "total_chips_count": 0,
            "remainder": float(amount)
        }, {}

    # Inventário disponível por jogador (reserva para todos na mesa)
    # Usamos string como chave para evitar problemas de float no dict
    inventory = {str(float(d.value)): (d.quantity if d.quantity > 0 else 999999) for d in active}
    
    remaining_value = Decimal(str(amount))
    kit_items = []
    
    def allocate(val_float: float, target_count: int):
        nonlocal remaining_value
        val_str = str(float(val_float))
        
        if val_str not in inventory or target_count <= 0 or remaining_value <= 0:
            return 0
        
        val_dec = Decimal(val_str)
        
        # Máximo por jogador respeitando a reserva de mesa
        max_per_player = inventory[val_str] // table_limit
        actual_count = min(target_count, max_per_player)
        
        # Limitado pelo valor restante
        max_by_value = int(remaining_value // val_dec)
        actual_count = min(actual_count, max_by_value)
        
        if actual_count > 0:
            kit_items.append({
                "value": float(val_float),
                "count": actual_count
            })
            remaining_value -= val_dec * actual_count
            inventory[val_str] -= (actual_count * table_limit)
            return actual_count
        return 0

    # 1. Fase de Pilha Base (Base Stack): 
    # Tenta garantir que o jogador tenha pelo menos ~15-20 fichas para "sentir o stack"
    # Começa das menores denominações que fazem sentido para o valor total
    base_target_units = 15
    for d in active:
        val = float(d.value)
        if remaining_value <= 0: break
        
        # Não usa fichas que sozinhas comem mais de 50% do valor total nesta fase
        if Decimal(str(val)) > (Decimal(str(amount)) * Decimal("0.5")):
            continue
            
        # Target: 10 a 15 fichas da menor denominação
        num_to_give = min(10, int(remaining_value // Decimal(str(val))))
        if num_to_give > 0:
            allocate(val, num_to_give)

    # 2. Base de Jogabilidade: Alocar ~30 Big Blinds
    if bb_val > 0 and remaining_value > 0:
        target_bb_value = Decimal(str(bb_val)) * 30
        if remaining_value < target_bb_value:
            target_bb_value = remaining_value
            
        current_fill = Decimal("0")
        
        # Pequeno mix de SBs (se existirem e ainda não tivermos dado o suficiente)
        if sb_val > 0:
            # Tenta chegar a pelo menos 15-20 SBs no total
            already_given = sum(item["count"] for item in kit_items if item["value"] == sb_val)
            needed_sb = max(0, 20 - already_given)
            if needed_sb > 0:
                sb_qty = allocate(sb_val, needed_sb)
                current_fill += Decimal(str(sb_val)) * sb_qty
            
        # Completa os 30 BBs com fichas de BB
        already_given_bb = sum(item["count"] for item in kit_items if item["value"] == bb_val)
        current_fill += Decimal(str(bb_val)) * already_given_bb
        
        if current_fill < target_bb_value:
            needed_bb = int((target_bb_value - current_fill) // Decimal(str(bb_val)))
            allocate(bb_val, needed_bb)

    # 3. Diversificação Progressiva (Fichas médias e grandes)
    for d in sorted(active, key=lambda d: float(d.value), reverse=True):
        val = float(d.value)
        if remaining_value <= 0: break
        if val <= bb_val: continue # Já tratamos os blinds

        # Tenta dar um mix (max 10 de cada inicialmente)
        max_v = int(remaining_value // Decimal(str(val)))
        allocate(val, min(max_v, 10))

    # 4. Preenchimento Final (Guloso)
    if remaining_value > 0:
        for d in sorted(active, key=lambda d: float(d.value), reverse=True):
            val = float(d.value)
            if remaining_value <= 0: break
            max_v = int(remaining_value // Decimal(str(val)))
            allocate(val, max_v)

    # Formatação de saída final
    final_items_map = {}
    total_chips_count = 0
    calculated_total_value = Decimal("0")
    
    for item in kit_items:
        v_float = item["value"]
        v_str = str(v_float)
        if v_str in final_items_map:
            final_items_map[v_str]["count"] += item["count"]
        else:
            # Busca denominação original para label/color
            denom = next((d for d in active if float(d.value) == v_float), None)
            if denom:
                final_items_map[v_str] = {
                    "value": v_float,
                    "label": denom.label,
                    "color": denom.color,
                    "count": item["count"]
                }
    
    items_list = sorted(list(final_items_map.values()), key=lambda x: x["value"])
    for i in items_list:
        total_chips_count += i["count"]
        calculated_total_value += Decimal(str(i["value"])) * i["count"]

    return {
        "items": items_list,
        "total_value": float(calculated_total_value),
        "total_chips_count": total_chips_count,
        "remainder": float(remaining_value)
    }, {float(k): v for k, v in inventory.items()}


def calculate_rebuy_kit(
    denominations: list[ChipDenomination],
    amount: float,
    table_limit: int,
    remaining_inventory: dict[float, int]
) -> dict:
    """
    Kits de Rebuy focam em fichas maiores, mas mantêm um mix para jogo.
    """
    table_limit = max(1, table_limit)
    active = sorted([d for d in denominations if d.active], key=lambda d: float(d.value), reverse=True)
    
    remaining_value = Decimal(str(amount))
    kit_items = []
    
    # Converte inventário para string para segurança
    inv_str = {str(float(k)): v for k, v in remaining_inventory.items()}
    
    for d in active:
        val_float = float(d.value)
        val_str = str(val_float)
        if val_str not in inv_str or remaining_value <= 0: continue
            
        max_per_player = inv_str[val_str] // table_limit
        max_by_value = int(remaining_value // Decimal(val_str))
        actual_count = min(max_by_value, max_per_player)
        
        if actual_count > 0:
            # Diversifica: max 5 fichas de cada denominação grande inicialmente
            if any(float(x.value) < val_float for x in active):
                actual_count = min(actual_count, 5) 
            
            kit_items.append({"value": val_float, "count": actual_count})
            remaining_value -= Decimal(val_str) * actual_count
            inv_str[val_str] -= (actual_count * table_limit)

    # Preenchimento final
    if remaining_value > 0:
        for d in active:
            val_float = float(d.value)
            val_str = str(val_float)
            if val_str not in inv_str: continue
            max_per_player = inv_str[val_str] // table_limit
            max_by_value = int(remaining_value // Decimal(val_str))
            actual_count = min(max_by_value, max_per_player)
            if actual_count > 0:
                kit_items.append({"value": val_float, "count": actual_count})
                remaining_value -= Decimal(val_str) * actual_count
                inv_str[val_str] -= (actual_count * table_limit)

    # Merge
    final_items = {}
    total_chips_count = 0
    calculated_total_val = Decimal("0")
    for item in kit_items:
        v_str = str(item["value"])
        if v_str in final_items:
            final_items[v_str]["count"] += item["count"]
        else:
            denom = next((d for d in active if float(d.value) == item["value"]), None)
            if denom:
                final_items[v_str] = {
                    "value": float(denom.value), "label": denom.label, "color": denom.color, "count": item["count"]
                }
            
    items_list = sorted(list(final_items.values()), key=lambda x: x["value"])
    for i in items_list:
        total_chips_count += i["count"]
        calculated_total_val += Decimal(str(i["value"])) * i["count"]

    # Atualiza o inventário original
    for k_str, v in inv_str.items():
        remaining_inventory[float(k_str)] = v

    return {
        "items": items_list,
        "total_value": float(calculated_total_val),
        "total_chips_count": total_chips_count,
        "remainder": float(remaining_value)
    }


def calculate_breakdown(
    denominations: list[ChipDenomination],
    amount: float,
    excluded_values: list[float] | None = None,
    blinds_info: str = "0/0",
    table_limit: int = 1
) -> dict:
    """Wrapper inteligente para cálculos de breakdown manuais."""
    # Filtra denominações excluídas
    excluded = set(excluded_values or [])
    filtered_denoms = [d for d in denominations if float(d.value) not in excluded]
    
    res, _ = calculate_buyin_kit(filtered_denoms, amount, blinds_info, table_limit)
    return res

