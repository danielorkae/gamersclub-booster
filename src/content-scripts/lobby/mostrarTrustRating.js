import { getFromStorage, setStorage } from '../../lib/storage';
import { getPlayerInfo } from './getPlayerInfo';

const CACHE_TTL = 7 * 24 * 60 * 60 * 1000; // 7 dias

const limparCache = async () => {
  const ultimaLimpeza = await getFromStorage( 'ultimaLimpezaTrustRatingCache' );
  if ( !ultimaLimpeza || ultimaLimpeza < Date.now() - CACHE_TTL ) {
    const cache = await getFromStorage( 'trustRatingCache' ) || {};
    for ( const [ id, obj ] of Object.entries( cache ) ) {
      if ( obj.ttl <= Date.now() ) { delete cache[id]; }
    }
    await setStorage( 'trustRatingCache', cache );
    await setStorage( 'ultimaLimpezaTrustRatingCache', Date.now() );
  }
};

const getTrustRatingColor = score => {
  if ( score === 100 ) { return '#0df397'; }
  if ( score < 50 ) { return '#eb2f2f'; }
  const hue = Math.round( ( score - 50 ) / 49 * 60 );
  return `hsl(${hue}, 80%, 50%)`;
};

const fetchTrustRating = async steamId => {
  await limparCache();

  const cache = await getFromStorage( 'trustRatingCache' ) || {};
  if ( cache?.[steamId]?.ttl > Date.now() ) { return cache[steamId].rating; }

  const response = await new Promise( resolve =>
    chrome.runtime.sendMessage( { type: 'FETCH_TRUST_RATING', steamId }, resolve )
  );

  if ( !response?.success ) { return null; }

  const rating = response.data?.result?.trust_rating ?? null;
  cache[steamId] = { rating, ttl: Date.now() + CACHE_TTL };
  await setStorage( 'trustRatingCache', cache );
  return rating;
};

export const mostrarTrustRating = async mutations => {
  const enabled = await getFromStorage( 'mostrarTrustRating', 'sync' );
  if ( !enabled ) { return; }

  $.each( mutations, async ( _, mutation ) => {
    $( mutation.addedNodes )
      .find( 'a.LobbyPlayerVertical' )
      .addBack( 'a.LobbyPlayerVertical' )
      .each( async ( _, element ) => {
        const $element = $( element );

        if ( $element.find( 'div.PlayerPlaceholder' ).length > 0 ) { return; }
        if ( $element.find( '#gcbooster_trustrating' ).length ) { return; }

        const gcPlayerId = ( $element.attr( 'href' ) || '' ).split( '/' ).pop();
        if ( !gcPlayerId ) { return; }

        const badgeStyles = {
          'margin-bottom': '2px',
          'margin-top': '2px',
          'width': '100%',
          'padding': '2px 4px',
          'text-align': 'center',
          'font-weight': '700',
          'background-color': 'rgba(10,12,16,0.82)',
          'font-size': '10px',
          'line-height': '1.4'
        };

        const $badge = $( '<div/>', { 'id': 'gcbooster_trustrating', 'css': { ...badgeStyles, 'color': 'rgba(255,255,255,0.15)' } } )
          .html( '<span style="color:rgba(255,255,255,0.15)">CS</span><span style="color:rgba(13,243,151,0.15)">REP</span> —' );

        const $kdrBadge = $element.find( '#gcbooster_kdr' );
        if ( $kdrBadge.length ) {
          $kdrBadge.after( $badge );
        } else {
          $element.prepend( $badge );
        }

        const playerData = await getPlayerInfo( gcPlayerId );
        const steamId = playerData?.steamId;
        if ( !steamId ) { return; }

        $badge
          .css( 'cursor', 'pointer' )
          .on( 'click', e => {
            e.preventDefault();
            e.stopPropagation();
            window.open( `https://csrep.gg/player/${steamId}`, '_blank' );
          } );

        const rating = await fetchTrustRating( steamId );
        if ( rating === null || rating === undefined ) { return; }

        const color = getTrustRatingColor( Number( rating ) );
        const score = Math.floor( Number( rating ) );

        $badge
          .css( { ...badgeStyles, 'color': color, 'cursor': 'pointer' } )
          .html( `<span style="color:#fff">CS</span><span style="color:#0df397">REP</span> ${score}%` );
      } );
  } );
};
