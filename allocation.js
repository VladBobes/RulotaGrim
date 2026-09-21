(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  Object.keys(api).forEach((key) => {
    root[key] = api[key];
  });
})(typeof window !== 'undefined' ? window : globalThis, function () {
  const items = [
      { key: 'plicCocaina', name: 'Plic cocaină', capacity: 2000, price: 13600 },
      { key: 'joint', name: 'Joint', capacity: 2000, price: 7500 },
      { key: 'tigara', name: 'Țigară', capacity: 2000, price: 4700 },
      { key: 'redFire', name: 'Red Fire', capacity: 1000, price: 5400 },
      { key: 'greenHaze', name: 'Green Haze', capacity: 1000, price: 8600 },
      { key: 'blueCurrent', name: 'Blue Current', capacity: 1000, price: 12600 },
    ];
  
    const GROVE_CAPS = {
      plicCocaina: 2000,
      joint: 2000,
      tigara: 2000,
      blueCurrent: 1000,
      greenHaze: 1000,
      redFire: 1000,
    };
  
    const TRAILER_PRESETS = [
      {
        id: 'grove',
        name: 'Grove',
        kicker: 'Preset',
        summary: '2.000 coca · 2.000 joint · 2.000 țigări',
        capacities: { ...GROVE_CAPS },
      },
      {
        id: 'vespucci',
        name: 'Vespucci',
        kicker: 'Preset',
        summary: '2.000 coca · 2.000 joint · 2.000 țigări',
        capacities: { ...GROVE_CAPS },
      },
      {
        id: 'mirror',
        name: 'Mirror',
        kicker: 'Preset',
        summary: '1.600 coca · 2.000 joint · 2.000 țigări',
        capacities: {
          plicCocaina: 1600,
          joint: 2000,
          tigara: 2000,
          blueCurrent: 1000,
          greenHaze: 1000,
          redFire: 1000,
        },
      },
      {
        id: 'sandy',
        name: 'Sandy',
        kicker: 'Preset',
        summary: '1.000 coca · 1.600 joint · 1.600 țigări',
        capacities: {
          plicCocaina: 1000,
          joint: 1600,
          tigara: 1600,
          blueCurrent: 600,
          greenHaze: 600,
          redFire: 600,
        },
      },
      {
        id: 'custom',
        name: 'Custom',
        kicker: 'Manual',
        summary: 'Fiecare cantitate o setezi tu',
        capacities: null,
      },
    ];

  function qty(value) {
      return new Intl.NumberFormat('ro-RO').format(value || 0);
    }

  function money(value) {
      return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);
    }

  function isValidCnp(value) {
      return value.length >= 1 && value.length <= 5 && [...value].every(ch => ch >= '0' && ch <= '9');
    }

  function computeMinimumForcedValues(allocations, itemSummaries) {
      return allocations.map((player, playerIndex) => {
        return itemSummaries.reduce((sum, summary) => {
          const item = summary.item;
          const totalRequestedByOthers = allocations.reduce((otherSum, otherPlayer, otherIndex) => {
            return otherIndex === playerIndex ? otherSum : otherSum + (otherPlayer.quantities[item.key] || 0);
          }, 0);

          const forcedQuantity = Math.max(0, summary.deliverableQuantity - totalRequestedByOthers);
          return sum + forcedQuantity * item.price;
        }, 0);
      });
    }

  function computeBoundedFairTargets(minValues, maxValues, totalValue) {
      let low = Math.min(...minValues);
      let high = Math.max(...maxValues);

      for (let i = 0; i < 80; i++) {
        const mid = (low + high) / 2;
        const sum = minValues.reduce((acc, minValue, index) => {
          return acc + Math.min(Math.max(mid, minValue), maxValues[index]);
        }, 0);

        if (sum < totalValue) low = mid;
        else high = mid;
      }

      return minValues.map((minValue, index) => Math.min(Math.max(high, minValue), maxValues[index]));
    }

  function computeEqualFairTargets(maxValues, totalValue) {
      return computeBoundedFairTargets(Array(maxValues.length).fill(0), maxValues, totalValue);
    }

  function allocateBalancedByMoney(allocations, itemSummaries) {
      const deliverableByItem = Object.fromEntries(itemSummaries.map(s => [s.item.key, s.deliverableQuantity]));
      let bestAllocations = null;
      let bestRevenue = null;
      let bestScore = null;

      const baseOrders = [
        [...items].sort((a, b) => b.price - a.price),
        [...items].sort((a, b) => a.price - b.price),
        [...items],
        [...items].reverse(),
      ];

      for (const order of baseOrders) {
        runGreedyTrial(order);
      }

      let seed = 123456789;
      for (let trial = 0; trial < 90; trial++) {
        const order = shuffleDeterministic([...items], seed + trial * 9973);
        runGreedyTrial(order);
      }

      for (let playerIndex = 0; playerIndex < allocations.length; playerIndex++) {
        allocations[playerIndex].allocated = bestAllocations[playerIndex];
      }

      bestRevenue.splice(0, bestRevenue.length, ...allocations.map(p => items.reduce((sum, item) => sum + ((p.allocated[item.key] || 0) * item.price), 0)));
      for (let i = 0; i < 20; i++) {
        const before = JSON.stringify(allocations.map(p => p.allocated));
        improveByPairTransfers(allocations, bestRevenue);
        improveByTransfers(allocations, bestRevenue);
        improveBySwaps(allocations, bestRevenue);
        improveByComboSwaps(allocations, bestRevenue);
        const after = JSON.stringify(allocations.map(p => p.allocated));
        if (before === after) break;
      }

      function runGreedyTrial(order) {
        const trialAllocations = allocations.map(() => Object.fromEntries(items.map(i => [i.key, 0])));
        const trialRevenue = allocations.map(() => 0);
        const remainingCapacity = { ...deliverableByItem };

        for (const item of order) {
          while (remainingCapacity[item.key] > 0) {
            let bestPlayer = -1;
            let bestCandidateScore = null;

            for (let playerIndex = 0; playerIndex < allocations.length; playerIndex++) {
              const requested = allocations[playerIndex].quantities[item.key] || 0;
              if (trialAllocations[playerIndex][item.key] >= requested) continue;

              const candidateRevenue = [...trialRevenue];
              candidateRevenue[playerIndex] += item.price;
              const candidateScore = targetBalanceScore(candidateRevenue, allocations);

              if (!bestCandidateScore || isBetterScore(candidateScore, bestCandidateScore)) {
                bestCandidateScore = candidateScore;
                bestPlayer = playerIndex;
              } else if (scoreEquals(candidateScore, bestCandidateScore)) {
                const currentDiff = Math.abs(allocations[playerIndex].targetValue - candidateRevenue[playerIndex]);
                const bestDiff = Math.abs(allocations[bestPlayer].targetValue - (trialRevenue[bestPlayer] + item.price));
                if (currentDiff < bestDiff) bestPlayer = playerIndex;
              }
            }

            if (bestPlayer === -1) break;
            trialAllocations[bestPlayer][item.key] += 1;
            trialRevenue[bestPlayer] += item.price;
            remainingCapacity[item.key] -= 1;
          }
        }

        const score = targetBalanceScore(trialRevenue, allocations);
        if (!bestScore || isBetterScore(score, bestScore)) {
          bestScore = score;
          bestRevenue = trialRevenue;
          bestAllocations = trialAllocations.map(a => ({ ...a }));
        }
      }
    }

  function shuffleDeterministic(array, seed) {
      function random() {
        seed = (seed * 1664525 + 1013904223) >>> 0;
        return seed / 4294967296;
      }

      for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
      }
      return array;
    }

  function scoreEquals(a, b) {
      return a.maxTargetDiff === b.maxTargetDiff && a.sumTargetDiff === b.sumTargetDiff && a.range === b.range;
    }

  function targetBalanceScore(revenues, allocations) {
      const diffs = revenues.map((value, index) => Math.abs(value - allocations[index].targetValue));
      return {
        maxTargetDiff: Math.max(...diffs),
        sumTargetDiff: diffs.reduce((sum, value) => sum + value, 0),
        range: Math.max(...revenues) - Math.min(...revenues),
      };
    }

  function improveByPairTransfers(allocations, currentRevenue) {
      let changed = true;
      let guard = 0;

      while (changed && guard < 50000) {
        changed = false;
        guard += 1;

        let bestMove = null;

        for (let from = 0; from < allocations.length; from++) {
          for (let to = 0; to < allocations.length; to++) {
            if (from === to) continue;
            if (currentRevenue[from] <= allocations[from].targetValue) continue;
            if (currentRevenue[to] >= allocations[to].targetValue) continue;

            for (const item of items) {
              if ((allocations[from].allocated[item.key] || 0) <= 0) continue;
              if ((allocations[to].allocated[item.key] || 0) >= (allocations[to].quantities[item.key] || 0)) continue;

              const beforePairDiff = Math.abs(currentRevenue[from] - allocations[from].targetValue)
                + Math.abs(currentRevenue[to] - allocations[to].targetValue);
              const afterFrom = currentRevenue[from] - item.price;
              const afterTo = currentRevenue[to] + item.price;
              const afterPairDiff = Math.abs(afterFrom - allocations[from].targetValue)
                + Math.abs(afterTo - allocations[to].targetValue);

              if (afterPairDiff >= beforePairDiff) continue;

              const improvement = beforePairDiff - afterPairDiff;
              const candidateRevenue = [...currentRevenue];
              candidateRevenue[from] = afterFrom;
              candidateRevenue[to] = afterTo;
              const candidateScore = targetBalanceScore(candidateRevenue, allocations);

              if (!bestMove
                || improvement > bestMove.improvement
                || (improvement === bestMove.improvement && isBetterScore(candidateScore, bestMove.score))) {
                bestMove = { from, to, item, improvement, score: candidateScore, revenue: candidateRevenue };
              }
            }
          }
        }

        if (bestMove) {
          allocations[bestMove.from].allocated[bestMove.item.key] -= 1;
          allocations[bestMove.to].allocated[bestMove.item.key] += 1;
          currentRevenue.splice(0, currentRevenue.length, ...bestMove.revenue);
          changed = true;
        }
      }
    }

  function improveByTransfers(allocations, currentRevenue) {
      let changed = true;
      let guard = 0;

      while (changed && guard < 20000) {
        changed = false;
        guard += 1;

        const oldScore = targetBalanceScore(currentRevenue, allocations);
        let bestMove = null;

        for (let from = 0; from < allocations.length; from++) {
          for (let to = 0; to < allocations.length; to++) {
            if (from === to || currentRevenue[from] <= currentRevenue[to]) continue;

            for (const item of items) {
              if ((allocations[from].allocated[item.key] || 0) <= 0) continue;
              if ((allocations[to].allocated[item.key] || 0) >= (allocations[to].quantities[item.key] || 0)) continue;

              const candidateRevenue = [...currentRevenue];
              candidateRevenue[from] -= item.price;
              candidateRevenue[to] += item.price;
              const candidateScore = targetBalanceScore(candidateRevenue, allocations);

              if (isBetterScore(candidateScore, oldScore) && (!bestMove || isBetterScore(candidateScore, bestMove.score))) {
                bestMove = { from, to, item, score: candidateScore, revenue: candidateRevenue };
              }
            }
          }
        }

        if (bestMove) {
          allocations[bestMove.from].allocated[bestMove.item.key] -= 1;
          allocations[bestMove.to].allocated[bestMove.item.key] += 1;
          currentRevenue.splice(0, currentRevenue.length, ...bestMove.revenue);
          changed = true;
        }
      }
    }

  function improveBySwaps(allocations, currentRevenue) {
      let changed = true;
      let guard = 0;

      while (changed && guard < 20000) {
        changed = false;
        guard += 1;

        const oldScore = targetBalanceScore(currentRevenue, allocations);
        let bestSwap = null;

        for (let high = 0; high < allocations.length; high++) {
          for (let low = 0; low < allocations.length; low++) {
            if (high === low || currentRevenue[high] <= currentRevenue[low]) continue;

            for (const expensiveItem of items) {
              if ((allocations[high].allocated[expensiveItem.key] || 0) <= 0) continue;
              if ((allocations[low].allocated[expensiveItem.key] || 0) >= (allocations[low].quantities[expensiveItem.key] || 0)) continue;

              for (const cheapItem of items) {
                if (cheapItem.key === expensiveItem.key) continue;
                if ((allocations[low].allocated[cheapItem.key] || 0) <= 0) continue;
                if ((allocations[high].allocated[cheapItem.key] || 0) >= (allocations[high].quantities[cheapItem.key] || 0)) continue;

                const candidateRevenue = [...currentRevenue];
                candidateRevenue[high] = candidateRevenue[high] - expensiveItem.price + cheapItem.price;
                candidateRevenue[low] = candidateRevenue[low] + expensiveItem.price - cheapItem.price;

                const candidateScore = targetBalanceScore(candidateRevenue, allocations);

                if (isBetterScore(candidateScore, oldScore) && (!bestSwap || isBetterScore(candidateScore, bestSwap.score))) {
                  bestSwap = { high, low, expensiveItem, cheapItem, score: candidateScore, revenue: candidateRevenue };
                }
              }
            }
          }
        }

        if (bestSwap) {
          allocations[bestSwap.high].allocated[bestSwap.expensiveItem.key] -= 1;
          allocations[bestSwap.low].allocated[bestSwap.expensiveItem.key] += 1;
          allocations[bestSwap.low].allocated[bestSwap.cheapItem.key] -= 1;
          allocations[bestSwap.high].allocated[bestSwap.cheapItem.key] += 1;
          currentRevenue.splice(0, currentRevenue.length, ...bestSwap.revenue);
          changed = true;
        }
      }
    }

  function improveByComboSwaps(allocations, currentRevenue) {
      let changed = true;
      let guard = 0;

      while (changed && guard < 5000) {
        changed = false;
        guard += 1;

        const oldScore = targetBalanceScore(currentRevenue, allocations);
        let bestMove = null;

        for (let high = 0; high < allocations.length; high++) {
          for (let low = 0; low < allocations.length; low++) {
            if (high === low || currentRevenue[high] <= currentRevenue[low]) continue;

            const highItems = expandedAllocatedItems(allocations[high]);
            const lowItems = expandedAllocatedItems(allocations[low]);

            for (const giveHigh of highItems) {
              if ((allocations[low].allocated[giveHigh.key] || 0) >= (allocations[low].quantities[giveHigh.key] || 0)) continue;

              const lowCombos = buildCombos(lowItems, 3);
              for (const giveLowCombo of lowCombos) {
                if (!comboCanMoveTo(giveLowCombo, allocations[high])) continue;

                const comboValue = giveLowCombo.reduce((sum, item) => sum + item.price, 0);
                if (giveHigh.price <= comboValue) continue;

                const candidateRevenue = [...currentRevenue];
                candidateRevenue[high] = candidateRevenue[high] - giveHigh.price + comboValue;
                candidateRevenue[low] = candidateRevenue[low] + giveHigh.price - comboValue;
                const candidateScore = targetBalanceScore(candidateRevenue, allocations);

                if (isBetterScore(candidateScore, oldScore) && (!bestMove || isBetterScore(candidateScore, bestMove.score))) {
                  bestMove = { high, low, giveHigh, giveLowCombo, revenue: candidateRevenue, score: candidateScore };
                }
              }
            }
          }
        }

        if (bestMove) {
          allocations[bestMove.high].allocated[bestMove.giveHigh.key] -= 1;
          allocations[bestMove.low].allocated[bestMove.giveHigh.key] += 1;

          for (const item of bestMove.giveLowCombo) {
            allocations[bestMove.low].allocated[item.key] -= 1;
            allocations[bestMove.high].allocated[item.key] += 1;
          }

          currentRevenue.splice(0, currentRevenue.length, ...bestMove.revenue);
          changed = true;
        }
      }
    }

  function expandedAllocatedItems(player) {
      const result = [];
      for (const item of items) {
        const count = player.allocated[item.key] || 0;
        for (let i = 0; i < Math.min(count, 8); i++) result.push(item);
      }
      return result;
    }

  function buildCombos(list, maxSize) {
      const combos = [[]];
      for (const item of list) {
        const currentLength = combos.length;
        for (let i = 0; i < currentLength; i++) {
          if (combos[i].length >= maxSize) continue;
          combos.push([...combos[i], item]);
        }
      }
      return combos.filter(combo => combo.length > 0);
    }

  function comboCanMoveTo(combo, receiver) {
      const counts = {};
      for (const item of combo) counts[item.key] = (counts[item.key] || 0) + 1;

      return Object.entries(counts).every(([key, count]) => {
        return (receiver.allocated[key] || 0) + count <= (receiver.quantities[key] || 0);
      });
    }

  function balanceScore(revenues) {
      const avg = revenues.reduce((a, b) => a + b, 0) / revenues.length;
      return {
        range: Math.max(...revenues) - Math.min(...revenues),
        sumSquares: revenues.reduce((sum, value) => sum + Math.pow(value - avg, 2), 0),
        maxRevenue: Math.max(...revenues),
      };
    }

  function isBetterScore(a, b) {
      if (a.maxTargetDiff !== b.maxTargetDiff) return a.maxTargetDiff < b.maxTargetDiff;
      if (a.sumTargetDiff !== b.sumTargetDiff) return a.sumTargetDiff < b.sumTargetDiff;
      return a.range < b.range;
    }

  function applyCapacities(caps) {
    items.forEach(item => {
      const value = Number(caps[item.key]);
      item.capacity = Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0;
    });
  }

  function calculateDelivery(playerList, capacities) {
    if (capacities) applyCapacities(capacities);

    const allocations = playerList.map(p => ({
      ...p,
      allocated: Object.fromEntries(items.map(i => [i.key, 0])),
      revenue: 0,
      maxValue: items.reduce((sum, i) => sum + ((p.quantities[i.key] || 0) * i.price), 0),
      targetValue: 0,
    }));

    const itemSummaries = items.map(item => {
      const totalRequested = playerList.reduce((sum, p) => sum + (p.quantities[item.key] || 0), 0);
      return {
        item,
        totalRequested,
        capacity: item.capacity,
        deliverableQuantity: Math.min(item.capacity, totalRequested),
        finalAllocated: 0,
        limited: totalRequested > item.capacity,
        totalRevenue: 0,
      };
    });

    const totalAvailableValue = itemSummaries.reduce((sum, s) => sum + (s.deliverableQuantity * s.item.price), 0);
    const minimumForcedValues = computeMinimumForcedValues(allocations, itemSummaries);
    const fairTargets = computeBoundedFairTargets(minimumForcedValues, allocations.map(p => p.maxValue), totalAvailableValue);
    allocations.forEach((p, index) => {
      p.minimumForcedValue = minimumForcedValues[index];
      p.targetValue = fairTargets[index];
    });

    allocateBalancedByMoney(allocations, itemSummaries);

    allocations.forEach(p => {
      p.revenue = items.reduce((sum, item) => sum + ((p.allocated[item.key] || 0) * item.price), 0);
    });

    itemSummaries.forEach(s => {
      s.finalAllocated = allocations.reduce((sum, p) => sum + (p.allocated[s.item.key] || 0), 0);
      s.totalRevenue = s.finalAllocated * s.item.price;
    });

    const grandTotal = allocations.reduce((sum, p) => sum + p.revenue, 0);
    return { allocations, itemSummaries, grandTotal };
  }

  function formatDeliveryText(allocations, trailer) {
    const header = trailer && trailer.id !== 'custom' ? `Rulotă: ${trailer.name}\n\n` : '';

    const blocks = allocations.map(player => {
      const lines = [`${player.name} | ${player.cnp}`];
      let playerSum = 0;

      items.forEach(item => {
        const quantity = player.allocated[item.key] || 0;
        const requested = player.quantities[item.key] || 0;
        const value = quantity * item.price;
        playerSum += value;
        if (quantity === 0 && requested === 0) return;
        let line = `${item.name} | ${quantity} | ${money(value)}`;
        if (requested !== quantity) line += ` (cerut ${requested})`;
        lines.push(line);
      });

      lines.push(`Sumă alocată | ${money(playerSum)}`);
      return lines.join('\n');
    });

    const grandTotal = allocations.reduce((sum, player) => {
      return sum + items.reduce((itemSum, item) => itemSum + ((player.allocated[item.key] || 0) * item.price), 0);
    }, 0);

    const body = blocks.join('\n\n');
    const totalLine = `Sumă totală alocată | ${money(grandTotal)}`;
    if (!body) return header + totalLine;
    return header + body + '\n\n' + totalLine;
  }

  return {
    items,
    GROVE_CAPS,
    TRAILER_PRESETS,
    qty,
    money,
    isValidCnp,
    applyCapacities,
    calculateDelivery,
    formatDeliveryText,
  };
});
