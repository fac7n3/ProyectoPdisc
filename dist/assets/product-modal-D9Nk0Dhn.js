import{u as e}from"./speed-insights-CQz1TkY8.js";import{A as t,C as n,D as r,O as i,T as a,a as o,b as s,h as c,k as l,o as u,p as d,s as f,w as p,x as m,y as h}from"./cart-utils-CC9gmXFj.js";import{i as g}from"./reviews-utils-DKWWYxFV.js";import{n as _,t as v}from"./product-detail-api-CqTKCM_-.js";function y(e){return e?String(e).replace(/&/g,`&amp;`).replace(/</g,`&lt;`).replace(/>/g,`&gt;`).replace(/"/g,`&quot;`).replace(/'/g,`&#39;`):``}async function b(n){let[r,{data:{session:i}}]=await Promise.all([v(n),e.auth.getSession()]),a=d(r),s=!!(r.compare_at_price&&r.compare_at_price>r.price&&!a),c=s?Math.round((1-r.price/r.compare_at_price)*100):0,l=r.stores||{},u=(r.product_images||[]).slice().sort((e,t)=>e.position-t.position),f=[r.image_url||`/img/no-image.svg`,...u.map(e=>e.url)],p=l.free_shipping_threshold!=null&&r.price>=l.free_shipping_threshold,m;m=l.delivery_fee==null?`El costo de envío se calcula en el carrito, según el comercio.`:p||l.delivery_fee===0?`Envío gratis en este comercio.`:`Envío: ${o(l.delivery_fee)}`+(l.free_shipping_threshold?` (gratis desde ${o(l.free_shipping_threshold)})`:``);let h=``,g=``;s?(h=`-${c}%`,g=`descuento`):p&&(h=`Envío gratis`,g=`envio`);let _=r.review_average,b=r.review_count??0,x=_?Math.floor(_):0,S=_&&_-Math.floor(_)>=.5?1:0,C=Math.max(0,5-x-S),w=!!(i?.user?.id&&l.owner_id&&i.user.id===l.owner_id);return{id:r.id,isOwner:w,price:r.price,name:y(r.title||`Producto`),description:y(r.description||``),shop:y(l.name||`Comercio`),shopId:l.id||null,priceText:o(r.price),priceOldText:s?o(r.compare_at_price):``,discountText:s?`-${c}%`:``,images:f,imgSrc:f[0],imgAlt:y(r.title||`Producto`),shippingText:m,fullStars:x,halfStars:S,emptyStars:C,ratingCount:b,hasRating:b>0,badgeText:h,badgeType:g,stock:r.stock??0,optionGroups:t((r.product_options||[]).map(e=>({...e,values:e.product_option_values||[]})))}}function x(e,t,n){let r=``;for(let t=0;t<e;t++)r+=`<i class="fa-solid fa-star"></i>`;for(let e=0;e<t;e++)r+=`<i class="fa-solid fa-star-half-stroke"></i>`;let i=5-e-t;for(let e=0;e<i;e++)r+=`<i class="fa-regular fa-star empty"></i>`;return r}function S(e){return e<=0?{text:`Sin stock disponible`,cssClass:`low`,fillClass:`pm-stock__fill--low`}:e<=10?{text:`¡Últimas ${e} unidades!`,cssClass:`low`,fillClass:`pm-stock__fill--low`}:e<=25?{text:`Quedan ${e} unidades`,cssClass:`ok`,fillClass:`pm-stock__fill--mid`}:{text:`Disponible (${e} unidades)`,cssClass:`ok`,fillClass:`pm-stock__fill--high`}}function C(e,t){let n=document.querySelectorAll(`.product-card`),r=[];return n.forEach(n=>{if(n.id===e)return;let i=(n.dataset.category||``).split(` `);t.some(e=>e&&i.includes(e))&&r.push(n)}),r.length<8&&n.forEach(t=>{t.id!==e&&!r.includes(t)&&r.length<12&&r.push(t)}),r.slice(0,12)}function w(e){return`${window.location.pathname.includes(`/pages/`)?`./`:`./pages/`}comercio.html?id=${encodeURIComponent(e)}`}function T(){return`
    <div class="product-modal" role="dialog" aria-modal="true" aria-label="Cargando producto">
      <div class="pm-topbar">
        <button class="pm-topbar__back" id="pm-close-back" aria-label="Volver"><i class="fa-solid fa-chevron-left"></i> Atrás</button>
        <div class="pm-topbar__actions">
          <button class="pm-topbar__btn pm-topbar__btn--close" id="pm-close-btn" aria-label="Cerrar"><i class="fa-solid fa-xmark"></i></button>
        </div>
      </div>
      <div class="pm-loading" role="status" aria-live="polite">
        <div class="bl-spinner" aria-hidden="true">
          <div class="bl-spinner__dot"></div>
          <div class="bl-spinner__dot"></div>
          <div class="bl-spinner__dot"></div>
          <div class="bl-spinner__dot"></div>
          <div class="bl-spinner__dot"></div>
          <div class="bl-spinner__dot"></div>
        </div>
        <p class="bl-loading-block__title">Cargando</p>
        <p class="bl-loading-block__subtitle">Esto puede tomar unos segundos…</p>
      </div>
    </div>
  `}function E(e){let t=t=>e.querySelector(t)?.textContent?.trim()||``,n=t(`.product-card__name`)||t(`.fav-title`);return n?{title:n,shop:t(`.product-card__shop`),price:t(`.product-card__price`)||t(`.fav-price`),priceOld:t(`.product-card__price-old`),discount:t(`.product-card__discount`),image:e.querySelector(`.product-card__image img, img`)?.getAttribute(`src`)||``}:null}function D(e){let t=y(e.title),n=e.shop?`<div class="pm-shop">${y(e.shop)}</div>`:`<div class="pm-skel pm-skel--pill" aria-hidden="true"></div>`,r=e.price?`<span class="pm-price">${y(e.price)}</span>`:`<span class="pm-skel pm-skel--price" aria-hidden="true"></span>`,i=e.priceOld?`<span class="pm-price-old">${y(e.priceOld)}</span>`:``,a=e.discount?`<span class="pm-discount-tag">${y(e.discount)}</span>`:``;return`
    <div class="product-modal" role="dialog" aria-modal="true" aria-label="Cargando ${t}" aria-busy="true">
      <div class="pm-topbar">
        <button class="pm-topbar__back" id="pm-close-back" aria-label="Volver"><i class="fa-solid fa-chevron-left"></i> Atrás</button>
        <div class="pm-topbar__actions">
          <button class="pm-topbar__btn pm-topbar__btn--close" id="pm-close-btn" aria-label="Cerrar"><i class="fa-solid fa-xmark"></i></button>
        </div>
      </div>
      <div class="pm-main">
        <div class="pm-gallery-col">
          <div class="pm-gallery">${e.image?`<img class="pm-gallery__img" src="${encodeURI(e.image)}" alt="${t}" />`:``}</div>
        </div>
        <div class="pm-info">
          ${n}
          <h2 class="pm-name">${t}</h2>
          <div class="pm-rating"><span class="pm-skel pm-skel--line pm-skel--short" aria-hidden="true"></span></div>
          <div class="pm-price-block">
            <div class="pm-price-row">${r}${i}${a}</div>
            <div class="pm-shipping"><span class="pm-skel pm-skel--line" aria-hidden="true"></span></div>
          </div>
          <div class="pm-stock"><span class="pm-skel pm-skel--line pm-skel--short" aria-hidden="true"></span></div>
          <div class="pm-actions" aria-hidden="true">
            <span class="pm-skel pm-skel--btn"></span>
            <span class="pm-skel pm-skel--btn"></span>
          </div>
          <p class="sr-only" role="status" aria-live="polite">Cargando el detalle del producto…</p>
        </div>
      </div>
    </div>
  `}function O(){return`
    <div class="product-modal" role="dialog" aria-modal="true" aria-label="Error al cargar el producto">
      <div class="pm-topbar">
        <button class="pm-topbar__back" id="pm-close-back" aria-label="Volver"><i class="fa-solid fa-chevron-left"></i> Atrás</button>
        <div class="pm-topbar__actions">
          <button class="pm-topbar__btn pm-topbar__btn--close" id="pm-close-btn" aria-label="Cerrar"><i class="fa-solid fa-xmark"></i></button>
        </div>
      </div>
      <div class="pm-modal-error">
        <i class="fa-solid fa-triangle-exclamation"></i>
        <p>No se pudo cargar el producto.</p>
        <button type="button" class="pm-modal-error__retry" id="pm-retry-btn">Reintentar</button>
      </div>
    </div>
  `}function k(e){let t=S(e.stock),n=e.stock<=0,r=(e.shop||`?`).charAt(0).toUpperCase(),i=C(e.id,e.categories||[]),a=``;i.forEach(e=>{let t=y(e.querySelector(`.product-card__name`)?.textContent?.trim()||``),n=y(e.querySelector(`.product-card__price`)?.textContent||``),r=encodeURI(e.querySelector(`.product-card__image img`)?.getAttribute(`src`)||``),i=y(e.id||``);a+=`
      <div class="pm-related-card" data-related-id="${i}" tabindex="0" role="button" aria-label="Ver ${t}">
        <div class="pm-related-card__img">
          <img src="${r}" alt="${t}" loading="lazy" />
        </div>
        <div class="pm-related-card__body">
          <div class="pm-related-card__name">${t}</div>
          <div class="pm-related-card__price">${n}</div>
        </div>
      </div>
    `});let o=``;e.badgeText&&(o=`<span class="pm-gallery__badge pm-gallery__badge--${e.badgeType||`descuento`}">${e.badgeText}</span>`);let s=e.discountText?`<span class="pm-discount-tag">${e.discountText}</span>`:``,c=e.priceOldText?`<span class="pm-price-old">${e.priceOldText}</span>`:``,l=``;e.images.length>1&&(l=`
      <div class="pm-thumbs-row">
        ${e.images.map((t,n)=>`<img class="pm-thumb${n===0?` is-active`:``}" data-thumb-src="${encodeURI(t)}" src="${encodeURI(t)}" alt="${e.imgAlt}" loading="lazy" />`).join(``)}
      </div>
    `);let u=e.hasRating?`
      <div class="pm-rating__stars">${x(e.fullStars,e.halfStars,e.emptyStars)}</div>
      <span class="pm-rating__count">(${e.ratingCount} reseña${e.ratingCount===1?``:`s`})</span>
    `:`<span class="pm-rating__count">Todavía no tiene reseñas</span>`,d=``;return e.optionGroups.length>0&&(d=`
      <div class="pm-options" id="pm-options">
        ${e.optionGroups.map(e=>`
          <fieldset class="pm-option">
            <legend class="pm-option__title">${y(e.name)}</legend>
            <div class="pm-option__chips">
              ${e.values.map(t=>`
                <label class="pm-option__chip${t.is_available?``:` pm-option__chip--out`}">
                  <input type="radio" name="pm-opt-${y(e.id)}" value="${y(t.id)}" ${t.is_available?``:`disabled`} />
                  <span>${y(t.value)}</span>
                </label>
              `).join(``)}
            </div>
          </fieldset>
        `).join(``)}
      </div>
    `),`
    <div class="product-modal" role="dialog" aria-modal="true" aria-label="Detalle de ${e.name}">

      <div class="pm-topbar">
        <button class="pm-topbar__back" id="pm-close-back" aria-label="Volver">
          <i class="fa-solid fa-chevron-left"></i> Atrás
        </button>
        <div class="pm-topbar__actions">
          <button class="pm-topbar__btn" id="pm-share-btn" aria-label="Compartir producto">
            <i class="fa-solid fa-share-nodes"></i>
          </button>
          <button class="pm-topbar__btn pm-topbar__btn--close" id="pm-close-btn" aria-label="Cerrar">
            <i class="fa-solid fa-xmark"></i>
          </button>
        </div>
      </div>

      <div class="pm-main">

        <div class="pm-gallery-col">
          <div class="pm-gallery" id="pm-gallery">
            ${o}
            ${e.isOwner?``:`
            <button class="pm-gallery__fav" id="pm-fav-btn" aria-label="Agregar a favoritos">
              <i class="fa-regular fa-heart"></i>
            </button>
            `}
            ${e.images.length>1?`
            <button class="pm-gallery__nav pm-gallery__nav--prev" id="pm-gallery-prev" aria-label="Imagen anterior">
              <i class="fa-solid fa-chevron-left"></i>
            </button>
            <button class="pm-gallery__nav pm-gallery__nav--next" id="pm-gallery-next" aria-label="Imagen siguiente">
              <i class="fa-solid fa-chevron-right"></i>
            </button>
            `:``}
            <img class="pm-gallery__img" id="pm-gallery-img" src="${encodeURI(e.imgSrc)}" alt="${e.imgAlt}" />
          </div>
          ${l}
        </div>

        <div class="pm-info">

          <div class="pm-shop" id="pm-shop-link" tabindex="0" role="link" aria-label="Ver tienda ${e.shop}">
            ${e.shop}
          </div>

          <h2 class="pm-name">${e.name}</h2>

          <div class="pm-rating">
            ${u}
          </div>

          <div class="pm-price-block">
            <div class="pm-price-row">
              <span class="pm-price">${e.priceText}</span>
              ${c}
              ${s}
            </div>
            <div class="pm-shipping">
              ${e.shippingText}
            </div>
          </div>

          <!-- Stock -->
          <div class="pm-stock">
            <div class="pm-stock__text pm-stock__text--${t.cssClass}">
              <i class="fa-solid fa-circle-info"></i>
              ${t.text}
            </div>
            <div class="pm-stock__bar">
              <div class="pm-stock__fill ${t.fillClass}"></div>
            </div>
          </div>

          ${d}

          <!-- Quantity: se muestra siempre, pero el dueño viendo su propia vista
               previa no puede sumar/restar (es solo una vista previa, no una compra) -->
          <div class="pm-quantity">
            <span class="pm-quantity__label">Cantidad:</span>
            <div class="pm-quantity__controls">
              ${e.isOwner?``:`
              <button class="pm-quantity__btn" id="pm-qty-minus" aria-label="Reducir cantidad" disabled>
                <i class="fa-solid fa-minus"></i>
              </button>
              `}
              <input type="number" class="pm-quantity__value" id="pm-qty-value" value="1" min="1" max="${Math.max(e.stock,1)}" aria-label="Cantidad" ${n||e.isOwner?`disabled`:``} />
              ${e.isOwner?``:`
              <button class="pm-quantity__btn" id="pm-qty-plus" aria-label="Aumentar cantidad" ${n?`disabled`:``}>
                <i class="fa-solid fa-plus"></i>
              </button>
              `}
            </div>
          </div>

          <!-- Actions -->
          ${e.isOwner?`
          <div class="pm-actions">
            <p class="pm-owner-notice"><i class="fa-solid fa-store" aria-hidden="true"></i> Este es tu producto -- así lo ven tus clientes.</p>
          </div>
          `:`
          <div class="pm-actions">
            ${n?`
            <button class="pm-btn pm-btn--cart" id="pm-add-cart" disabled>
              Sin stock
            </button>
            `:`
            <button class="pm-btn pm-btn--cart" id="pm-add-cart">
              Añadir al carrito
            </button>
            <button class="pm-btn pm-btn--buy" id="pm-buy-now">
              Comprar ahora
            </button>
            `}
          </div>
          `}

        </div>
      </div>

      <hr class="pm-divider" />

      <!-- Tabs -->
      <div class="pm-tabs-section">
        <div class="pm-tabs" role="tablist">
          <button class="pm-tab is-active" data-tab="desc" role="tab" aria-selected="true">Descripción</button>
          <button class="pm-tab" data-tab="specs" role="tab" aria-selected="false">Características</button>
          <button class="pm-tab" data-tab="shop" role="tab" aria-selected="false">Sobre la tienda</button>
          <button class="pm-tab" data-tab="reviews" role="tab" aria-selected="false">Reseñas${e.hasRating?` (${e.ratingCount})`:``}</button>
        </div>

        <div class="pm-tab-content is-visible" data-tab-content="desc">
          <p class="pm-description">
            ${e.description||`Producto de <strong>${e.shop}</strong>, disponible en tu zona. Comprando local apoyás a los comercios de Baradero.`}
          </p>
        </div>

        <div class="pm-tab-content" data-tab-content="specs">
          <div class="pm-features">
            <div class="pm-feature-item">Vendido por ${e.shop}</div>
            <div class="pm-feature-item">${e.shippingText}</div>
            <div class="pm-feature-item">Disponible para envío y retiro en tienda</div>
          </div>
        </div>

        <div class="pm-tab-content" data-tab-content="shop">
          <div class="pm-shop-info">
            <div class="pm-shop-info__avatar">${r}</div>
            <div class="pm-shop-info__details">
              <div class="pm-shop-info__name">${e.shop}</div>
              <div class="pm-shop-info__meta">
                <i class="fa-solid fa-circle-check"></i> Comercio verificado • Baradero
              </div>
            </div>
            <button class="pm-shop-info__link" id="pm-view-shop-btn" aria-label="Ver todos los productos de ${e.shop}">
              Ver tienda
            </button>
          </div>
        </div>

        <div class="pm-tab-content" data-tab-content="reviews">
          <div id="pm-reviews-container">
            <p style="color: var(--bl-text-muted); font-size: 0.9rem;">Cargando reseñas...</p>
          </div>
        </div>
      </div>

      ${i.length>0?`
        <hr class="pm-divider" />
        <!-- Related Products -->
        <div class="pm-related">
          <h3 class="pm-related__title">Productos relacionados</h3>
          <div class="pm-related__carousel">
            <button type="button" class="pm-related__nav pm-related__nav--prev" aria-label="Ver productos relacionados anteriores">
              <i class="fa-solid fa-chevron-left" aria-hidden="true"></i>
            </button>
            <div class="pm-related__scroll">
              ${a}
            </div>
            <button type="button" class="pm-related__nav pm-related__nav--next" aria-label="Ver más productos relacionados">
              <i class="fa-solid fa-chevron-right" aria-hidden="true"></i>
            </button>
          </div>
        </div>
      `:``}

    </div>
  `}var A=null,j=null,M=null;function N(e){let t=(history.state?.pmDepth||0)+1;history.pushState({pmProduct:e,pmDepth:t},``,location.href)}function P(){let e=history.state?.pmDepth||0;e>0?history.go(-e):I()}window.addEventListener(`popstate`,e=>{let t=e.state?.pmProduct,n=t&&document.getElementById(t);n?F(n,{skipHistoryPush:!0}):A&&I()});async function F(e,{skipHistoryPush:t=!1}={}){if(!e.id){console.error(`Se intentó abrir el modal de un producto sin id real (UUID)`);return}A&&I(),j=document.activeElement;let n=e.id,r=(e.dataset.category||``).split(` `);t||N(n);let i=document.createElement(`div`);i.className=`product-modal-overlay`,i.id=`pm-overlay`;let a=E(e);i.innerHTML=a?D(a):T(),document.body.appendChild(i),A=i;let o=window.innerWidth-document.documentElement.clientWidth;document.documentElement.style.setProperty(`--scrollbar-width`,o+`px`),document.body.classList.add(`modal-open`),i.offsetHeight,requestAnimationFrame(()=>i.classList.add(`is-open`)),i.addEventListener(`click`,e=>{(e.target.closest(`#pm-close-back`)||e.target.closest(`#pm-close-btn`))&&P()}),M=e=>{e.key===`Escape`&&P()},document.addEventListener(`keydown`,M);try{let e=await b(n);if(e.categories=r,A!==i)return;i.innerHTML=k(e),L(i,e);let t=i.querySelector(`.pm-stock__fill`);if(t){let n=e.stock<=0?`0%`:``;t.style.width=`0%`,requestAnimationFrame(()=>{requestAnimationFrame(()=>{t.style.width=n})})}}catch(t){if(console.error(`Error al cargar el producto en el modal:`,t),A!==i)return;i.innerHTML=O(),i.querySelector(`#pm-retry-btn`)?.addEventListener(`click`,()=>F(e))}}function I(){if(!A)return;A.classList.remove(`is-open`),document.body.classList.remove(`modal-open`),document.documentElement.style.removeProperty(`--scrollbar-width`);let e=A;A=null,M&&=(document.removeEventListener(`keydown`,M),null),setTimeout(()=>{e.remove()},400),j&&=(j.focus(),null)}function L(e,t){let o=e.querySelector(`.product-modal`),d=e.querySelector(`#pm-gallery`);d?.addEventListener(`click`,e=>{e.target.closest(`.pm-gallery__fav`)||e.target.closest(`.pm-gallery__nav`)||d.classList.toggle(`is-zoomed`)});let _=e.querySelector(`#pm-gallery-img`),v=Array.from(e.querySelectorAll(`.pm-thumb`)),y=0;function b(e){let n=t.images.length;if(n===0)return;y=(e%n+n)%n;let r=t.images[y];_&&r&&(_.src=encodeURI(r)),v.forEach((e,t)=>e.classList.toggle(`is-active`,t===y))}if(v.forEach((e,t)=>{e.addEventListener(`click`,()=>b(t))}),e.querySelector(`#pm-gallery-prev`)?.addEventListener(`click`,()=>b(y-1)),e.querySelector(`#pm-gallery-next`)?.addEventListener(`click`,()=>b(y+1)),t.shopId){let n=()=>{window.location.href=w(t.shopId)},r=e.querySelector(`#pm-shop-link`);r?.addEventListener(`click`,n),r?.addEventListener(`keydown`,e=>{(e.key===`Enter`||e.key===` `)&&(e.preventDefault(),n())}),e.querySelector(`#pm-view-shop-btn`)?.addEventListener(`click`,n)}let x=e.querySelector(`#pm-fav-btn`);if(x&&t.id){let e=x.querySelector(`i`),n=!1;f().then(r=>{n=r.includes(t.id),x.classList.toggle(`is-active`,n),e.classList.toggle(`fa-solid`,n),e.classList.toggle(`fa-regular`,!n)}),x.addEventListener(`click`,async()=>{let r=n;n=!r,x.classList.toggle(`is-active`,n),e.classList.toggle(`fa-solid`,n),e.classList.toggle(`fa-regular`,!n),s(n?`Agregado a favoritos`:`Eliminado de favoritos`,n?`success`:`default`);try{await m(t.id,r)}catch(e){console.error(`Error al actualizar favoritos:`,e)}})}let S=e.querySelector(`#pm-qty-value`),C=e.querySelector(`#pm-qty-minus`),T=e.querySelector(`#pm-qty-plus`);function E(){let e=parseInt(S.value,10)||1;C.disabled=e<=1,T.disabled=e>=t.stock}C?.addEventListener(`click`,()=>{let e=parseInt(S.value,10)||1;e>1&&(S.value=e-1),E()}),T?.addEventListener(`click`,()=>{let e=parseInt(S.value,10)||1;e<t.stock&&(S.value=e+1),E()}),S?.addEventListener(`change`,()=>{let e=parseInt(S.value,10)||1;e=Math.max(1,Math.min(e,t.stock)),S.value=e,E()});let D=e.querySelector(`#pm-add-cart`);D?.addEventListener(`click`,()=>{let o=parseInt(S?.value,10)||1,d=c(t.priceOldText),f=[...e.querySelectorAll(`#pm-options input[type="radio"]:checked`)].map(e=>e.value),m=l(t.optionGroups,f);if(m.length>0){s(`Elegí ${m.map(e=>e.toLowerCase()).join(` y `)} antes de agregar al carrito.`,`error`),e.querySelector(`#pm-options`)?.scrollIntoView({behavior:`smooth`,block:`center`});return}let g=p(t.optionGroups,f),_=a(t.id,f),v=u(),y=v.find(e=>i(e)===_);y?(y.qty+=o,y.selected=!0):v.push({id:t.id,name:t.name,shop:t.shop,price:t.price,priceOld:d||null,image:t.imgSrc,qty:o,options:f,optionsLabel:g,selected:!0}),h(v),n(),D.classList.add(`pm-btn--added`);let b=D.innerHTML;D.innerHTML=`<i class="fa-solid fa-check"></i> ¡Agregado!`,setTimeout(()=>{D.classList.remove(`pm-btn--added`),D.innerHTML=b},1800);let x=r(p(t.optionGroups,f));s(`${t.name}${x?` (${x})`:``} agregado al carrito (x${o})`,`success`)}),e.querySelector(`#pm-buy-now`)?.addEventListener(`click`,()=>{let r=parseInt(S?.value,10)||1,o=c(t.priceOldText),d=[...e.querySelectorAll(`#pm-options input[type="radio"]:checked`)].map(e=>e.value),f=l(t.optionGroups,d);if(f.length>0){s(`Elegí ${f.map(e=>e.toLowerCase()).join(` y `)} antes de comprar.`,`error`),e.querySelector(`#pm-options`)?.scrollIntoView({behavior:`smooth`,block:`center`});return}let m=a(t.id,d),g=u(),_=g.find(e=>i(e)===m);_?(_.qty+=r,_.selected=!0):g.push({id:t.id,name:t.name,shop:t.shop,price:t.price,priceOld:o||null,image:t.imgSrc,qty:r,options:d,optionsLabel:p(t.optionGroups,d),selected:!0}),h(g),n(),I();let v=window.location.pathname.includes(`/pages/`);window.location.href=v?`./carrito.html`:`./pages/carrito.html`}),e.querySelector(`#pm-share-btn`)?.addEventListener(`click`,async()=>{let e={title:t.name,text:`Mirá ${t.name} en Baradero Local por ${t.priceText}`,url:window.location.href};try{navigator.share?await navigator.share(e):(await navigator.clipboard.writeText(`${e.text} — ${e.url}`),s(`¡Link copiado al portapapeles!`,`success`))}catch(e){if(e.name!==`AbortError`)try{await navigator.clipboard.writeText(window.location.href),s(`¡Link copiado!`,`success`)}catch{}}});let O=e.querySelectorAll(`.pm-tab`),k=e.querySelectorAll(`.pm-tab-content`),A=!1;O.forEach(n=>{n.addEventListener(`click`,()=>{O.forEach(e=>{e.classList.remove(`is-active`),e.setAttribute(`aria-selected`,`false`)}),k.forEach(e=>e.classList.remove(`is-visible`)),n.classList.add(`is-active`),n.setAttribute(`aria-selected`,`true`);let r=n.dataset.tab,i=e.querySelector(`[data-tab-content="${r}"]`);if(i&&i.classList.add(`is-visible`),r===`reviews`&&!A){A=!0;let n=e.querySelector(`#pm-reviews-container`);n&&g(n,`product`,t.id,{hideForm:t.isOwner})}})}),e.querySelectorAll(`.pm-related-card`).forEach(e=>{let t=()=>{let t=e.dataset.relatedId,n=document.getElementById(t);n&&F(n)};e.addEventListener(`click`,t),e.addEventListener(`keydown`,e=>{(e.key===`Enter`||e.key===` `)&&(e.preventDefault(),t())})});let j=e.querySelector(`.pm-related__scroll`);if(j){let t=e.querySelector(`.pm-related__nav--prev`),n=e.querySelector(`.pm-related__nav--next`),r=e=>{let t=j.querySelector(`.pm-related-card`),n=t?t.getBoundingClientRect().width+14:174;j.scrollBy({left:e*n*2,behavior:`smooth`})},i=()=>{let e=j.scrollWidth-j.clientWidth,r=j.scrollLeft<=4,i=j.scrollLeft>=e-4;t&&(t.disabled=r),n&&(n.disabled=e<=4||i)};t?.addEventListener(`click`,()=>r(-1)),n?.addEventListener(`click`,()=>r(1)),j.addEventListener(`scroll`,i,{passive:!0}),i()}let M=o.querySelectorAll(`button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])`),N=M[0],P=M[M.length-1];o.addEventListener(`keydown`,e=>{e.key===`Tab`&&(e.shiftKey?document.activeElement===N&&(e.preventDefault(),P.focus()):document.activeElement===P&&(e.preventDefault(),N.focus()))}),setTimeout(()=>N?.focus(),100)}var R=100,z=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;function B(e){let t=e.target.closest?.(`.product-card`);return!t||!z.test(t.id)||t.matches(`a[href]`)||e.target.closest(`.product-card__add, .product-card__wishlist`)?null:t}function V(e){let t=null,n=null;e.addEventListener(`pointerover`,e=>{if(e.pointerType!==`mouse`)return;let r=B(e);!r||r===n||(clearTimeout(t),n=r,t=setTimeout(()=>_(r.id),R))}),e.addEventListener(`pointerout`,e=>{n&&(e.relatedTarget&&n.contains(e.relatedTarget)||(clearTimeout(t),n=null))}),e.addEventListener(`pointerdown`,e=>{let t=B(e);t&&_(t.id)})}function H(){document.querySelectorAll(`.products__grid`).forEach(e=>{V(e),e.addEventListener(`click`,e=>{if(e.target.closest(`.product-card__add, .product-card__wishlist`)||e.target.closest(`a[href]`))return;let t=e.target.closest(`.product-card`);t&&(e.preventDefault(),F(t))})})}typeof window<`u`&&(window.initProductModal=H,window.openProductModal=F,window.closeProductModal=I);