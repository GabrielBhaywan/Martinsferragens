(() => {
      const slides = [...document.querySelectorAll('.slide')];
      const dots = [...document.querySelectorAll('.carousel-dots button')];
      const carousel = document.querySelector('.carousel');
      let current = 0;
      let timer;

      function showSlide(index) {
        current = (index + slides.length) % slides.length;
        slides.forEach((slide, i) => {
          const active = i === current;
          slide.classList.toggle('active', active);
          slide.setAttribute('aria-hidden', String(!active));
          dots[i].classList.toggle('active', active);
        });
      }

      function restartTimer() {
        window.clearInterval(timer);
        timer = window.setInterval(() => showSlide(current + 1), 6000);
      }

      document.querySelector('.carousel-control.prev').addEventListener('click', () => {
        showSlide(current - 1);
        restartTimer();
      });
      document.querySelector('.carousel-control.next').addEventListener('click', () => {
        showSlide(current + 1);
        restartTimer();
      });
      dots.forEach((dot, i) => dot.addEventListener('click', () => {
        showSlide(i);
        restartTimer();
      }));
      carousel.addEventListener('mouseenter', () => window.clearInterval(timer));
      carousel.addEventListener('mouseleave', restartTimer);
      restartTimer();
    })();

    (() => {
      const brandsSection = document.querySelector('#marcas');
      const offersSection = document.querySelector('#ofertas');
      offersSection.before(brandsSection);

      const products = [...document.querySelectorAll('.product')];
      const searchInput = document.querySelector('#search-input');
      const results = document.querySelector('#search-results');
      const cart = JSON.parse(localStorage.getItem('martins-cart') || '{}');
      const favorites = new Set(JSON.parse(localStorage.getItem('martins-favorites') || '[]'));
      const byId = new Map(products.map(product => [product.querySelector('.add-cart').dataset.id, product]));
      const normalize = value => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

      function editDistance(a, b) {
        const row = Array.from({ length: b.length + 1 }, (_, i) => i);
        for (let i = 1; i <= a.length; i++) {
          let previous = row[0];
          row[0] = i;
          for (let j = 1; j <= b.length; j++) {
            const saved = row[j];
            row[j] = Math.min(row[j] + 1, row[j - 1] + 1, previous + (a[i - 1] === b[j - 1] ? 0 : 1));
            previous = saved;
          }
        }
        return row[b.length];
      }

      function scoreProduct(product, query) {
        const text = normalize(product.innerText);
        const queryWords = normalize(query).split(/\s+/).filter(Boolean);
        if (!queryWords.length) return 0;
        return queryWords.reduce((score, word) => {
          if (text.includes(word)) return score + 4;
          const words = text.split(/[^a-z0-9]+/).filter(Boolean);
          const closest = Math.max(...words.map(candidate => 1 - editDistance(word, candidate) / Math.max(word.length, candidate.length)));
          return score + (closest > .48 ? closest : 0);
        }, 0);
      }

      function showSuggestions(query) {
        if (!query.trim()) {
          results.classList.remove('open');
          results.innerHTML = '';
          return;
        }
        const ranked = products.map(product => ({ product, score: scoreProduct(product, query) }))
          .sort((a, b) => b.score - a.score).slice(0, 5);
        results.innerHTML = ranked.map(({ product }) => {
          const title = product.querySelector('h3').textContent;
          const id = product.querySelector('.add-cart').dataset.id;
          return `<a class="search-result" href="#${id}" data-result-id="${id}"><span>${title}</span><strong>${product.querySelector('.price').textContent}</strong></a>`;
        }).join('');
        results.classList.add('open');
        results.querySelectorAll('[data-result-id]').forEach(link => link.addEventListener('click', event => {
          event.preventDefault();
          const product = byId.get(link.dataset.resultId);
          results.classList.remove('open');
          product.scrollIntoView({ behavior: 'smooth', block: 'center' });
          product.animate([{ outline: '3px solid #f26522' }, { outline: '0 solid transparent' }], { duration: 1100 });
        }));
      }

      function updateCounts() {
        const cartCount = Object.values(cart).reduce((sum, quantity) => sum + quantity, 0);
        document.querySelectorAll('.cart-count').forEach(node => node.textContent = cartCount);
        document.querySelectorAll('.favorite-count').forEach(node => node.textContent = favorites.size);
        localStorage.setItem('martins-cart', JSON.stringify(cart));
        localStorage.setItem('martins-favorites', JSON.stringify([...favorites]));
      }

      function renderCart() {
        const holder = document.querySelector('#cart-items');
        const entries = Object.entries(cart).filter(([, quantity]) => quantity > 0);
        holder.innerHTML = entries.length ? entries.map(([id, quantity]) => {
          const product = byId.get(id);
          return `<div class="drawer-item"><span>${product.querySelector('h3').textContent}<br><small>${quantity} × ${product.querySelector('.price').textContent}</small></span><button type="button" data-remove-cart="${id}">Remover</button></div>`;
        }).join('') : '<p class="drawer-empty">Seu carrinho está vazio. Adicione produtos de exemplo para montar uma lista.</p>';
        const prices = entries.map(([id]) => getProductPrice(byId.get(id)));
        const total = entries.reduce((sum, [, quantity], index) => sum + (prices[index] || 0) * quantity, 0);
        const totalNode = document.querySelector('#cart-total');
        const checkoutButton = document.querySelector('#checkout-whatsapp');
        totalNode.textContent = !entries.length
          ? 'Adicione produtos para revisar seu pedido'
          : prices.every(price => price !== null)
          ? `Total estimado: ${total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`
          : 'Total a confirmar com a loja';
        checkoutButton.disabled = entries.length === 0;
        holder.querySelectorAll('[data-remove-cart]').forEach(button => button.addEventListener('click', () => {
          delete cart[button.dataset.removeCart];
          renderCart();
          updateCounts();
        }));
      }

      function getProductPrice(product) {
        const priceText = product.querySelector('.price').textContent;
        const normalizedPrice = priceText
          .replace(/[^\d,.-]/g, '')
          .replace(/\./g, '')
          .replace(',', '.');

        if (!/\d/.test(normalizedPrice)) return null;

        const price = Number(normalizedPrice);
        return Number.isFinite(price) ? price : null;
      }

      document.querySelector('#cart-order-form').addEventListener('submit', event => {
        event.preventDefault();

        const entries = Object.entries(cart).filter(([, quantity]) => quantity > 0);
        if (!entries.length || !event.currentTarget.reportValidity()) return;

        const customerName = document.querySelector('#cart-customer-name').value.trim();
        const notes = document.querySelector('#cart-order-notes').value.trim();
        const items = entries.map(([id, quantity]) => {
          const product = byId.get(id);
          const productName = product.querySelector('h3').textContent.trim();
          const priceText = product.querySelector('.price').textContent.trim();
          const price = getProductPrice(product);
          const subtotal = price === null
            ? ''
            : ` — subtotal ${(price * quantity).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`;

          return `• ${quantity}x ${productName} — ${priceText}${subtotal}`;
        });
        const prices = entries.map(([id]) => getProductPrice(byId.get(id)));
        const total = entries.reduce((sum, [, quantity], index) => sum + (prices[index] || 0) * quantity, 0);
        const totalLine = prices.every(price => price !== null)
          ? `\nTotal estimado: ${total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`
          : '\nTotal: a confirmar com a loja.';
        const notesLine = notes ? `\n\nObservações: ${notes}` : '';
        const message = [
          'Olá, Martins Ferragens! Gostaria de revisar este pedido.',
          '',
          ...(customerName ? [`Cliente: ${customerName}`, ''] : []),
          'Itens:',
          ...items
        ].join('\n') + totalLine + notesLine;
        const whatsappUrl = `https://wa.me/5583987485536?text=${encodeURIComponent(message)}`;

        window.open(whatsappUrl, '_blank', 'noopener,noreferrer');
      });

      function renderFavorites() {
        const holder = document.querySelector('#favorite-items');
        const items = [...favorites].filter(id => byId.has(id));
        holder.innerHTML = items.length ? items.map(id => {
          const product = byId.get(id);
          return `<div class="drawer-item"><span>${product.querySelector('h3').textContent}<br><small>${product.querySelector('.price').textContent}</small></span><button type="button" data-remove-favorite="${id}">Remover</button></div>`;
        }).join('') : '<p class="drawer-empty">Ainda não há produtos favoritos.</p>';
        holder.querySelectorAll('[data-remove-favorite]').forEach(button => button.addEventListener('click', () => {
          favorites.delete(button.dataset.removeFavorite);
          syncFavoriteButtons();
          renderFavorites();
          updateCounts();
        }));
      }

      function syncFavoriteButtons() {
        document.querySelectorAll('.favorite-toggle').forEach(button => {
          const active = favorites.has(button.dataset.id);
          button.classList.toggle('active', active);
          button.textContent = active ? '♥' : '♡';
          button.setAttribute('aria-pressed', String(active));
        });
      }

      function openDrawer(name) {
        closeDrawers();
        document.querySelector('#drawer-backdrop').classList.add('open');
        document.querySelector(`#${name}-drawer`).classList.add('open');
        document.querySelector(`#${name}-drawer`).setAttribute('aria-hidden', 'false');
        if (name === 'cart') renderCart();
        if (name === 'favorites') renderFavorites();
      }

      searchInput.addEventListener('input', () => showSuggestions(searchInput.value));
      document.querySelector('#product-search').addEventListener('submit', event => {
        event.preventDefault();
        showSuggestions(searchInput.value);
      });
      document.addEventListener('click', event => {
        if (!event.target.closest('.search-wrap')) results.classList.remove('open');
      });
      document.querySelectorAll('.add-cart').forEach(button => button.addEventListener('click', () => {
        cart[button.dataset.id] = (cart[button.dataset.id] || 0) + 1;
        updateCounts();
        renderCart();
      }));
      document.querySelectorAll('.favorite-toggle').forEach(button => button.addEventListener('click', () => {
        favorites.has(button.dataset.id) ? favorites.delete(button.dataset.id) : favorites.add(button.dataset.id);
        syncFavoriteButtons();
        updateCounts();
      }));
      document.querySelectorAll('[data-open-drawer]').forEach(button => button.addEventListener('click', () => openDrawer(button.dataset.openDrawer)));
      document.querySelectorAll('.drawer-close').forEach(button => button.addEventListener('click', closeDrawers));
      document.querySelector('#drawer-backdrop').addEventListener('click', closeDrawers);
      function closeDrawers() {
        document.querySelectorAll('.drawer').forEach(drawer => {
          drawer.classList.remove('open');
          drawer.setAttribute('aria-hidden', 'true');
        });
        document.querySelector('#drawer-backdrop').classList.remove('open');
      }

      document.querySelectorAll('[data-rail]').forEach(rail => {
        const track = rail.querySelector('[data-track]');
        rail.querySelector('.rail-control.prev').addEventListener('click', () => track.scrollBy({ left: -track.clientWidth * .8, behavior: 'smooth' }));
        rail.querySelector('.rail-control.next').addEventListener('click', () => track.scrollBy({ left: track.clientWidth * .8, behavior: 'smooth' }));
      });

      const brandButtons = [...document.querySelectorAll('[data-brand]')];
      const brandPanels = [...document.querySelectorAll('[data-brand-panel]')];
      brandButtons.forEach(button => button.addEventListener('click', () => {
        brandButtons.forEach(item => {
          const active = item === button;
          item.classList.toggle('active', active);
          item.setAttribute('aria-selected', String(active));
        });
        brandPanels.forEach(panel => {
          panel.hidden = panel.dataset.brandPanel !== button.dataset.brand;
        });
      }));

      syncFavoriteButtons();
      renderCart();
      updateCounts();
    })();
