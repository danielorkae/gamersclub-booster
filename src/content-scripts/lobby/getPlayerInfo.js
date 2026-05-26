import { getFromStorage, setStorage } from '../../lib/storage';
import { GC_URL } from '../../lib/constants';

const BASE_URL = `https://${GC_URL}/player`;

const SELETOR_DATA_CRIACAO = '.gc-list-title';

const DOIS_DIAS = ( 2 * 24 * 60 * 60 * 1000 );

// Limpa o cache a cada 2 dias se o TTL for menor q 'agora'
const limparCache = async () => {
  const cache = await getFromStorage( 'lupaCache' ) || {};
  for ( const [ id, obj ] of Object.entries( cache ) ) {
    if ( obj.ttl <= Date.now() || !obj.steamId ) {
      delete cache[id];
    }
  }
  await setStorage( 'lupaCache', cache );
  await setStorage( 'ultimaLimpezaCache', Date.now() );
};

const getAnotacao = html => {
  if ( $( html ).find( '.gc-button-notes-negative' )[0] ) {
    return 'Negativa';
  }
  if ( $( html ).find( '.gc-button-notes-positive' )[0] ) {
    return 'Positiva';
  }
  return 'Nenhuma';
};

export async function getPlayerInfo( id ) {
  const ultimaLimpezaCache = await getFromStorage( 'ultimaLimpezaCache' );
  if ( !ultimaLimpezaCache || ultimaLimpezaCache < Date.now() - DOIS_DIAS ) {
    await limparCache();
  }
  const lupaCache = await getFromStorage( 'lupaCache' ) || {};
  if ( lupaCache?.[id]?.ttl > Date.now() ) {
    return lupaCache[id];
  }
  const promise = new Promise( resolve => {
    const url = `${BASE_URL}/${id}`;

    $.get( url, function ( html ) {
      const $html = $( html );

      const dataCriacaoElement = $html.find( SELETOR_DATA_CRIACAO ).filter( function () {
        const text = $( this ).text().trim().toLowerCase();
        return /(registrado\s*(em|el)|registered\s*in)/i.test( text );
      } ).first();

      const dataCriacao = dataCriacaoElement.next().text().trim();
      const firstTab = $html.find( '#cs2-history-list' ).first();

      let totalPartidas = 0;
      let totalVitorias = 0;
      let totalDerrotas = 0;

      firstTab.find( '.gc-card-history-text' ).each( function () {
        const text = $( this ).clone().children().remove().end().text().trim();
        const qtd = parseInt( text.replace( /\D/g, '' ), 10 );
        if ( !isNaN( qtd ) ) { totalPartidas += qtd; }
      } );

      firstTab.find( '.gc-card-history-detail span' ).each( function () {
        const txt = $( this ).text().trim().toLowerCase();

        if ( /vit[óo]ri(a|as)|victor(y|ies|ias)/i.test( txt ) ) {
          const qtd = parseInt( txt.replace( /\D/g, '' ), 10 );
          if ( !isNaN( qtd ) ) { totalVitorias += qtd; }
        }

        if ( /derrotas?|defeat(s)?/i.test( txt ) ) {
          const qtd = parseInt( txt.replace( /\D/g, '' ), 10 );
          if ( !isNaN( qtd ) ) { totalDerrotas += qtd; }
        }
      } );

      const totalJogos = totalVitorias + totalDerrotas;
      const porcentagemVitoria =
        totalJogos > 0 ? ( ( totalVitorias / totalJogos ) * 100 ).toFixed( 2 ) : '0.00';

      const anotacao = getAnotacao( html );
      const steamLink = $html.find( 'a[href*="steamcommunity.com/profiles/"]' ).attr( 'href' );
      const steamIdMatch = steamLink?.match( /steamcommunity\.com\/profiles\/(\d+)/ );
      const steamId = steamIdMatch?.[1] || null;

      const response = {
        dataCriacao,
        totalPartidas,
        porcentagemVitoria,
        anotacao,
        steamId,
        ttl: Date.now() + DOIS_DIAS
      };

      // Só cacheia quando tem steamId — sem steamId pode ser ausência de Steam
      // ou falha temporária, então deixa tentar de novo na próxima vez
      if ( steamId ) {
        lupaCache[id] = response;
        setStorage( 'lupaCache', lupaCache );
      }

      resolve( response );
    } ).fail( () => resolve( { steamId: null } ) );
  } );

  return promise;
}
