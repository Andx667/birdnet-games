// BirdNet Auto Battler Game Logic
// Uses common.js for BirdNet API and shared helpers

// --- Bird Data and Game Setup ---
const STARTING_HEALTH = 30;
const STARTING_CURRENCY = 1;
const SHOP_SIZE = 6;
const MAX_BOARD_SIZE = 5;
const RARITY_COST = { common: 1, uncommon: 2, rare: 3, 'extremely rare': 4 };
const BIRD_TIERS = [
    { rarity: 'common', weight: 6 },
    { rarity: 'uncommon', weight: 3 },
    { rarity: 'rare', weight: 1 }
];

let allBirds = [];
let player = {
    health: STARTING_HEALTH,
    currency: STARTING_CURRENCY,
    board: [],
    hand: [],
};
let ai = {
    health: STARTING_HEALTH,
    board: [],
    shop: [],
    currency: STARTING_CURRENCY,
};
let round = 1;
let shopBirds = [];
let phase = 'shop'; // 'shop' or 'battle'
let arrows = [];
let playerSavedBoard = [];
let aiSavedBoard = [];

// --- DOM Elements ---
const playerHealthEl = document.getElementById('player-health');
const aiHealthEl = document.getElementById('ai-health');
const currencyEl = document.getElementById('currency');
const shopEl = document.getElementById('shop');
const playerBoardEl = document.getElementById('player-board');
const aiBoardEl = document.getElementById('ai-board');
const endShopBtn = document.getElementById('end-shop');
const phaseIndicator = document.getElementById('phase-indicator');
const arrowsEl = document.getElementById('arrows');
const messageEl = document.getElementById('message');

// --- BirdNet API Integration ---
async function loadBirds() {
    // Use a static list for demo, or fetch from BirdNet API if available
    // Each bird: { id, name, scientificName, rarity, attack, health }
    allBirds = [
        { id: 'sparrow', name: 'House Sparrow', scientificName: 'Passer domesticus', rarity: 'common', attack: 2, health: 5 },
        { id: 'robin', name: 'European Robin', scientificName: 'Erithacus rubecula', rarity: 'common', attack: 1, health: 6 },
        { id: 'blackbird', name: 'Common Blackbird', scientificName: 'Turdus merula', rarity: 'common', attack: 2, health: 7 },
        { id: 'jay', name: 'Eurasian Jay', scientificName: 'Garrulus glandarius', rarity: 'uncommon', attack: 3, health: 8 },
        { id: 'woodpecker', name: 'Great Spotted Woodpecker', scientificName: 'Dendrocopos major', rarity: 'uncommon', attack: 4, health: 7 },
        { id: 'owl', name: 'Barn Owl', scientificName: 'Tyto alba', rarity: 'rare', attack: 6, health: 10 },
        { id: 'eagle', name: 'Golden Eagle', scientificName: 'Aquila chrysaetos', rarity: 'rare', attack: 7, health: 12 },
    ];
}

function getRarityColor(rarity) {
    switch (rarity) {
        case 'common': return '#bbb';
        case 'uncommon': return '#43a047';
        case 'extremely rare': return '#ff9800';
        default: return '#eee';
    }
}

function getRarityBgColor(rarity) {
    switch (rarity) {
        case 'common': return '#f8f9fa';
        case 'uncommon': return '#e8f5e9';
        case 'rare': return '#e3f2fd';
        case 'extremely rare': return '#fff3e0';
        default: return '#f8f9fa';
    }
}

function getRandomBird(rarity) {
    const birds = allBirds.filter(b => b.rarity === rarity);
    const base = birds[Math.floor(Math.random() * birds.length)];
    return { ...base, maxHealth: base.health };
}

function getRandomShopBird() {
    // Weighted random by rarity
    let totalWeight = BIRD_TIERS.reduce((sum, t) => sum + t.weight, 0);
    let r = Math.random() * totalWeight;
    for (let tier of BIRD_TIERS) {
        if (r < tier.weight) {
            return getRandomBird(tier.rarity);
        }
        r -= tier.weight;
    }
    // fallback
    return getRandomBird('common');
}

function generateShop(targetShopArr) {
    targetShopArr.length = 0;
    for (let i = 0; i < SHOP_SIZE; i++) {
        targetShopArr.push(getRandomShopBird());
    }
}

function aiBuyPhase() {
    while (ai.currency > 0 && ai.board.length < MAX_BOARD_SIZE && ai.shop.length > 0) {
        // 1. Try to get a triple
        let tripleIdx = -1;
        for (let i = 0; i < ai.shop.length; i++) {
            let bird = ai.shop[i];
            let cost = RARITY_COST[bird.rarity] || 1;
            let sameBirds = ai.board.filter(b => b.id === bird.id);
            if (sameBirds.length === 2 && ai.currency >= cost) {
                tripleIdx = i;
                break;
            }
        }
        if (tripleIdx !== -1) {
            let bird = ai.shop[tripleIdx];
            let cost = RARITY_COST[bird.rarity] || 1;
            ai.currency -= cost;
            ai.board = ai.board.filter(b => b.id !== bird.id);
            const newTier = (ai.board.find(b => b.id === bird.id)?.tier || 1) + 1;
            const newMax = bird.maxHealth + 2;
            ai.board.push({ ...bird, attack: bird.attack + 1, health: bird.health + 2, maxHealth: newMax, tier: newTier });
            ai.shop.splice(tripleIdx, 1);
            continue;
        }
        // 2. Buy rarest bird AI can afford
        let rarityOrder = { 'rare': 3, 'uncommon': 2, 'common': 1 };
        let affordable = ai.shop.map((b, i) => ({ b, i, cost: RARITY_COST[b.rarity] || 1 })).filter(x => x.cost <= ai.currency);
        if (affordable.length === 0) break;
        let rarest = affordable.reduce((best, x) => {
            if (!best || rarityOrder[x.b.rarity] > rarityOrder[best.b.rarity]) return x;
            return best;
        }, null);
        let candidates = affordable.filter(x => rarityOrder[x.b.rarity] === rarityOrder[rarest.b.rarity]);
        let bestIdx = rarest.i;
        if (candidates.length > 1) {
            let maxAtk = Math.max(...candidates.map(x => x.b.attack));
            let bestBird = candidates.find(x => x.b.attack === maxAtk);
            bestIdx = bestBird.i;
        }
        let bird = ai.shop[bestIdx];
        let cost = RARITY_COST[bird.rarity] || 1;
        ai.currency -= cost;
        let sameBirds = ai.board.filter(b => b.id === bird.id);
        if (sameBirds.length === 2) {
            ai.board = ai.board.filter(b => b.id !== bird.id);
            const newTier = (sameBirds[0].tier || 1) + 1;
            const newMax = bird.maxHealth + 2;
            ai.board.push({ ...bird, attack: bird.attack + 1, health: bird.health + 2, maxHealth: newMax, tier: newTier });
        } else {
            ai.board.push({ ...bird });
        }
        ai.shop.splice(bestIdx, 1);
    }
}

// --- Rendering ---
function render() {
    playerHealthEl.textContent = `Player Health: ${player.health}`;
    aiHealthEl.textContent = `AI Health: ${ai.health}`;
    currencyEl.textContent = `Currency: ${player.currency}`;
    phaseIndicator.textContent = phase === 'shop' ? `Shop Phase (Round ${round})` : 'Battle Phase';
    renderShop();
    renderBoard(playerBoardEl, player.board, true);
    renderBoard(aiBoardEl, ai.board, false);
    renderArrows();
}

function renderShop() {
    shopEl.innerHTML = '';
    if (phase !== 'shop') return;
    shopBirds.forEach((bird, idx) => {
        const card = createBirdCard(bird);
        card.onclick = () => buyBird(idx);
        shopEl.appendChild(card);
    });
}

function renderBoard(boardEl, board, isPlayer) {
    boardEl.innerHTML = '';
    // Set board to single row, no wrapping, and expand width, but keep inside container
    boardEl.style.display = 'flex';
    boardEl.style.flexDirection = 'row';
    boardEl.style.flexWrap = 'nowrap';
    boardEl.style.justifyContent = 'center';
    boardEl.style.alignItems = 'flex-end';
    boardEl.style.width = '100%';
    boardEl.style.maxWidth = '90vw';
    boardEl.style.overflowX = 'auto';
    boardEl.style.margin = '0 auto 12px auto';
    board.forEach((bird, idx) => {
        const card = createBirdCard(bird);
        card.setAttribute('data-board', isPlayer ? 'player' : 'ai');
        card.setAttribute('data-idx', idx);
        boardEl.appendChild(card);
    });
}

function createBirdCard(bird) {
    const div = document.createElement('div');
    div.className = 'bird-card';
    div.style.borderColor = getRarityColor(bird.rarity);
    div.style.background = getRarityBgColor(bird.rarity);
    let maxHP = bird.maxHealth || bird.health;
    if (!bird.maxHealth) bird.maxHealth = bird.health;
    // Show 0 cost for free reward birds
    const cost = bird.freeReward ? 0 : (RARITY_COST[bird.rarity] || 1);
    // Bird image
    const imgUrl = getBirdImageUrl(bird);
    const img = document.createElement('img');
    img.src = imgUrl;
    img.alt = bird.name;
    img.style.width = '60px';
    img.style.height = '60px';
    img.style.objectFit = 'cover';
    img.style.borderRadius = '50%';
    img.style.border = bird.isTriple ? '4px solid gold' : '3px solid #1976d2';
    img.style.background = '#e3f2fd';
    img.style.display = 'block';
    img.style.margin = '0 auto 6px auto';
    div.appendChild(img);
    div.innerHTML += `<strong>${bird.name}</strong><br>ATK: ${bird.attack} | HP: ${bird.health} / ${bird.maxHealth}<br><span style="font-size:0.8em;">${bird.rarity} | Cost: <span style='${bird.freeReward ? 'color:gold;font-weight:bold;' : ''}'>${cost}</span></span>`;
    if (bird.tier) div.innerHTML += `<br><span style="color:#f90;">★${bird.tier}</span>`;
    // Visual indicator for free reward
    if (bird.freeReward) {
        div.style.boxShadow = '0 0 12px 2px gold';
        const badge = document.createElement('div');
        badge.textContent = 'FREE!';
        badge.style.position = 'absolute';
        badge.style.top = '4px';
        badge.style.right = '8px';
        badge.style.background = 'gold';
        badge.style.color = '#333';
        badge.style.fontWeight = 'bold';
        badge.style.fontSize = '0.85em';
        badge.style.padding = '2px 8px';
        badge.style.borderRadius = '8px';
        badge.style.boxShadow = '0 1px 4px #aaa';
        div.style.position = 'relative';
        div.appendChild(badge);
    }
    return div;
}

function getBirdImageUrl(bird) {
    // Example BirdNET API image URL pattern (replace with actual if available)
    // Fallback to a placeholder if not found
    // For demo, use unsplash with bird name as query
    // Defensive: always return a valid image URL
    if (bird && bird.scientificName) {
        return `https://birdnet.cornell.edu/api2/bird/${encodeURIComponent(bird.scientificName)}.webp`;
    }
    return 'https://birdnet.cornell.edu/img/logo-birdnet-circle.png';
}

function renderArrows() {
    arrowsEl.innerHTML = '';
    arrows.forEach(arrow => {
        const { from, to, color } = arrow;
        const fromEl = getCardElement(from.board, from.idx);
        const toEl = getCardElement(to.board, to.idx);
        if (fromEl && toEl) {
            const arrowSvg = drawArrowBetween(fromEl, toEl, color);
            arrowsEl.appendChild(arrowSvg);
        }
    });
}

function getCardElement(board, idx) {
    const sel = `[data-board="${board}"][data-idx="${idx}"]`;
    return document.querySelector(sel);
}

function drawArrowBetween(fromEl, toEl, color = 'red') {
    // Get bounding rects
    const fromRect = fromEl.getBoundingClientRect();
    const toRect = toEl.getBoundingClientRect();
    // Calculate start/end points (center to center)
    const startX = fromRect.left + fromRect.width / 2;
    const startY = fromRect.top + fromRect.height / 2;
    const endX = toRect.left + toRect.width / 2;
    const endY = toRect.top + toRect.height / 2;
    // SVG overlay
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.classList.add('arrow');
    svg.style.position = 'fixed';
    svg.style.left = '0';
    svg.style.top = '0';
    svg.style.width = '100vw';
    svg.style.height = '100vh';
    svg.innerHTML = `<defs><marker id="arrowhead" markerWidth="10" markerHeight="7" refX="10" refY="3.5" orient="auto"><polygon points="0 0, 10 3.5, 0 7" fill="${color}"/></marker></defs><line x1="${startX}" y1="${startY}" x2="${endX}" y2="${endY}" stroke="${color}" stroke-width="3" marker-end="url(#arrowhead)" />`;
    return svg;
}

// --- Shop Phase ---
async function buyBird(idx) {
    if (phase !== 'shop') return;
    const bird = shopBirds[idx];
    const cost = bird.freeReward ? 0 : (RARITY_COST[bird.rarity] || 1);
    if (player.currency < cost) return;
    // Check if board is full and if this purchase would create a triple
    const sameBirds = player.board.filter(b => b.id === bird.id);
    const willTriple = sameBirds.length === 2;
    if (player.board.length >= MAX_BOARD_SIZE && !willTriple) return;
    player.currency -= cost;
    player.board.push({ ...bird });
    shopBirds.splice(idx, 1);
    await combineTriples(player.board, true);
    render();
}

endShopBtn.onclick = () => {
    if (phase !== 'shop') return;
    // Save boards for restoration at the start of next round
    playerSavedBoard = player.board.map(b => ({ ...b }));
    aiSavedBoard = ai.board.map(b => ({ ...b }));
    phase = 'battle';
    endShopBtn.disabled = true;
    shopEl.innerHTML = '';
    startBattle();
};

// --- Battle Phase ---
function startBattle() {
    arrows = [];
    render();
    setTimeout(() => battleRound(), 800);
}

function battleRound() {
    let pBoard = player.board;
    let aBoard = ai.board;
    let playerTurn = Math.random() < 0.5 ? 'player' : 'ai';

    function attack(attackerBoard, defenderBoard, attackerName, defenderName) {
        if (attackerBoard.length === 0 || defenderBoard.length === 0) return;
        let attacker = attackerBoard[0];
        let defenderIdx = Math.floor(Math.random() * defenderBoard.length);
        let defender = defenderBoard[defenderIdx];
        // Clear previous arrows before new attack
        arrows = [];
        // Both deal damage simultaneously
        defender.health -= attacker.attack;
        attacker.health -= defender.attack;
        arrows.push({ from: { board: attackerName, idx: 0 }, to: { board: defenderName, idx: defenderIdx }, color: attackerName === 'player' ? 'blue' : 'red' });
        render();
        // Remove both if needed, always remove higher index first to avoid index shift
        let removeAttacker = attacker.health <= 0;
        let removeDefender = defender.health <= 0;
        if (removeAttacker && removeDefender) {
            if (defenderIdx > 0) {
                defenderBoard.splice(defenderIdx, 1);
                attackerBoard.splice(0, 1);
            } else {
                attackerBoard.splice(0, 1);
                defenderBoard.splice(defenderIdx, 1);
            }
        } else if (removeDefender) {
            defenderBoard.splice(defenderIdx, 1);
        } else if (removeAttacker) {
            attackerBoard.splice(0, 1);
        }
    }

    function doBattleStep() {
        if (pBoard.length === 0 || aBoard.length === 0) {
            setTimeout(() => checkGameEnd(), 900);
            return;
        }
        if (playerTurn === 'player') {
            attack(pBoard, aBoard, 'player', 'ai');
            playerTurn = 'ai';
        } else {
            attack(aBoard, pBoard, 'ai', 'player');
            playerTurn = 'player';
        }
        setTimeout(doBattleStep, 700);
    }
    doBattleStep();
}

function checkGameEnd() {
    // Deal leftover board damage to health
    if (player.board.length > 0 && ai.board.length === 0) {
        const totalAtk = player.board.reduce((sum, b) => sum + b.attack, 0);
        ai.health -= totalAtk;
        // Show final attack arrow from each player bird to center of AI board
        arrows = [];
        if (player.board.length > 0) {
            const aiBoardEl = document.getElementById('ai-board');
            const aiRect = aiBoardEl.getBoundingClientRect();
            const centerX = aiRect.left + aiRect.width / 2;
            const centerY = aiRect.top + aiRect.height / 2;
            player.board.forEach((bird, idx) => {
                const fromEl = getCardElement('player', idx);
                if (fromEl) {
                    const fromRect = fromEl.getBoundingClientRect();
                    const startX = fromRect.left + fromRect.width / 2;
                    const startY = fromRect.top + fromRect.height / 2;
                    // Custom arrow SVG
                    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
                    svg.classList.add('arrow');
                    svg.style.position = 'fixed';
                    svg.style.left = '0';
                    svg.style.top = '0';
                    svg.style.width = '100vw';
                    svg.style.height = '100vh';
                    svg.innerHTML = `<defs><marker id="arrowhead" markerWidth="10" markerHeight="7" refX="10" refY="3.5" orient="auto"><polygon points="0 0, 10 3.5, 0 7" fill="blue"/></marker></defs><line x1="${startX}" y1="${startY}" x2="${centerX}" y2="${centerY}" stroke="blue" stroke-width="3" marker-end="url(#arrowhead)" />`;
                    arrowsEl.appendChild(svg);
                }
            });
        }
        render();
    } else if (ai.board.length > 0 && player.board.length === 0) {
        const totalAtk = ai.board.reduce((sum, b) => sum + b.attack, 0);
        player.health -= totalAtk;
        // Show final attack arrow from each AI bird to center of player board
        arrows = [];
        if (ai.board.length > 0) {
            const playerBoardEl = document.getElementById('player-board');
            const playerRect = playerBoardEl.getBoundingClientRect();
            const centerX = playerRect.left + playerRect.width / 2;
            const centerY = playerRect.top + playerRect.height / 2;
            ai.board.forEach((bird, idx) => {
                const fromEl = getCardElement('ai', idx);
                if (fromEl) {
                    const fromRect = fromEl.getBoundingClientRect();
                    const startX = fromRect.left + fromRect.width / 2;
                    const startY = fromRect.top + fromRect.height / 2;
                    // Custom arrow SVG
                    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
                    svg.classList.add('arrow');
                    svg.style.position = 'fixed';
                    svg.style.left = '0';
                    svg.style.top = '0';
                    svg.style.width = '100vw';
                    svg.style.height = '100vh';
                    svg.innerHTML = `<defs><marker id="arrowhead" markerWidth="10" markerHeight="7" refX="10" refY="3.5" orient="auto"><polygon points="0 0, 10 3.5, 0 7" fill="red"/></marker></defs><line x1="${startX}" y1="${startY}" x2="${centerX}" y2="${centerY}" stroke="red" stroke-width="3" marker-end="url(#arrowhead)" />`;
                    arrowsEl.appendChild(svg);
                }
            });
        }
        render();
    }
    if (player.health <= 0 && ai.health <= 0) {
        showMessage('Draw! Both players lost all health.');
        endShopBtn.disabled = true;
        return;
    } else if (player.health <= 0) {
        showMessage('You lost!');
        endShopBtn.disabled = true;
        return;
    } else if (ai.health <= 0) {
        showMessage('You win!');
        endShopBtn.disabled = true;
        return;
    }
    // Next round
    round++;
    player.currency = round;
    ai.currency = round;
    // Restore boards to saved state
    player.board = playerSavedBoard.map(b => ({ ...b }));
    ai.board = aiSavedBoard.map(b => ({ ...b }));
    startShopPhase();
    showMessage('Next round!');
}

function showMessage(msg) {
    messageEl.textContent = msg;
    setTimeout(() => { messageEl.textContent = ''; }, 2000);
}

// --- Game Start ---
async function startGame() {
    await loadBirds();
    player = { health: STARTING_HEALTH, currency: STARTING_CURRENCY, board: [], hand: [] };
    ai = { health: STARTING_HEALTH, board: [], shop: [], currency: STARTING_CURRENCY };
    round = 1;
    player.currency = STARTING_CURRENCY;
    ai.currency = STARTING_CURRENCY;
    startShopPhase();
}

endShopBtn.onclick = () => {
    if (phase !== 'shop') return;
    // Save boards for restoration at the start of next round
    playerSavedBoard = player.board.map(b => ({ ...b }));
    aiSavedBoard = ai.board.map(b => ({ ...b }));
    phase = 'battle';
    endShopBtn.disabled = true;
    shopEl.innerHTML = '';
    startBattle();
};

async function startShopPhase() {
    // Combine triples for player and AI before shop
    await combineTriples(player.board, true);
    await combineTriples(ai.board, false);
    // AI gets new shop and buys first
    generateShop(ai.shop);
    ai.currency = player.currency;
    aiBuyPhase();
    // Player gets new shop
    generateShop(shopBirds);
    phase = 'shop';
    endShopBtn.disabled = false;
    arrows = [];
    render();
}

window.onload = function() {
    endShopBtn.textContent = 'Ready';
    startGame();
};

// Helper to get next rarity
function getNextRarity(current) {
    if (current === 'common') return 'uncommon';
    if (current === 'uncommon') return 'rare';
    if (current === 'rare') return 'extremely rare';
    return 'extremely rare';
}

// Helper to get random bird of a rarity
function getRandomBirdOfRarity(rarity) {
    const birds = allBirds.filter(b => b.rarity === rarity);
    if (birds.length === 0) return null;
    const base = birds[Math.floor(Math.random() * birds.length)];
    return { ...base, maxHealth: base.health };
}

// Show modal for player to pick a triple reward
function showTripleRewardModal(options, onPick) {
    // Remove any existing modal
    let old = document.getElementById('triple-modal');
    if (old) old.remove();
    const modal = document.createElement('div');
    modal.id = 'triple-modal';
    modal.style.position = 'fixed';
    modal.style.left = '0';
    modal.style.top = '0';
    modal.style.width = '100vw';
    modal.style.height = '100vh';
    modal.style.background = 'rgba(0,0,0,0.5)';
    modal.style.display = 'flex';
    modal.style.alignItems = 'center';
    modal.style.justifyContent = 'center';
    modal.style.zIndex = '9999';
    const box = document.createElement('div');
    box.style.background = '#fff';
    box.style.padding = '24px 18px';
    box.style.borderRadius = '12px';
    box.style.boxShadow = '0 2px 16px rgba(0,0,0,0.18)';
    box.style.display = 'flex';
    box.style.gap = '18px';
    box.style.justifyContent = 'center';
    box.innerHTML = '<div style="font-weight:600;font-size:1.1em;margin-bottom:10px;width:100%;text-align:center;">Choose your triple reward!</div>';
    options.forEach((bird, idx) => {
        const card = createBirdCard(bird);
        card.style.cursor = 'pointer';
        card.onclick = () => {
            document.body.removeChild(modal);
            onPick(bird);
        };
        box.appendChild(card);
    });
    modal.appendChild(box);
    document.body.appendChild(modal);
}

// Combine triples: if 3 of the same bird, offer a reward of 3 random birds of next rarity
function combineTriples(board, isPlayer) {
    return new Promise(resolve => {
        let counts = {};
        for (let bird of board) {
            let key = bird.id;
            if (!counts[key]) counts[key] = [];
            counts[key].push(bird);
        }
        let tripleRewards = [];
        for (let key in counts) {
            let birds = counts[key];
            while (birds.length >= 3) {
                // Remove all of this bird from board
                for (let i = board.length - 1; i >= 0; i--) {
                    if (board[i].id === key) board.splice(i, 1);
                }
                // Get next rarity
                let base = allBirds.find(b => b.id === key);
                let nextRarity = getNextRarity(base.rarity);
                // Generate 3 random options
                let options = [getRandomBirdOfRarity(nextRarity), getRandomBirdOfRarity(nextRarity), getRandomBirdOfRarity(nextRarity)];
                // For player, defer pick to modal; for AI, pick random
                tripleRewards.push({ options, isPlayer });
                birds.splice(0, 3);
            }
        }
        // Handle rewards
        function handleReward(idx) {
            if (idx >= tripleRewards.length) return resolve();
            const reward = tripleRewards[idx];
            if (reward.isPlayer) {
                showTripleRewardModal(reward.options, chosen => {
                    // Add chosen reward to shop at 0 cost
                    chosen.freeReward = true;
                    shopBirds.unshift({ ...chosen });
                    render();
                    setTimeout(() => handleReward(idx + 1), 0);
                });
            } else {
                // AI picks at random, add to AI shop at 0 cost
                const chosen = reward.options[Math.floor(Math.random() * reward.options.length)];
                chosen.freeReward = true;
                ai.shop.unshift({ ...chosen });
                setTimeout(() => handleReward(idx + 1), 0);
            }
        }
        handleReward(0);
    });
}
