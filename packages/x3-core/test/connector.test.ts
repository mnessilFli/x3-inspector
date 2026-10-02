import { describe, expect, it } from 'vitest';
import { looksSecret } from '../src/connector/params';
import { basicToken, buildSoapEnvelope, checkInputXml, inputXmlTemplate, parseSoapResponse, parseWsDescription, salesforceVerdict } from '../src/connector/soap';

describe('SOAP envelope (same shape as the SF connector)', () => {
  it('builds run with callContext, publicName and inputXml in CDATA', () => {
    const e = buildSoapEnvelope({ method: 'run', codeLang: 'FRA', poolAlias: 'PREPROD', publicName: 'YWWSBPC', inputXml: '<PARAM><GRP ID="GRP1"><FLD NAME="BPC_BPCNUM">C1</FLD></GRP></PARAM>' });
    expect(e).toContain('xmlns:wss="http://www.adonix.com/WSS"');
    expect(e).toContain('<wss:run soapenv:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">');
    expect(e).toContain('<codeLang xsi:type="xsd:string">FRA</codeLang><poolAlias xsi:type="xsd:string">PREPROD</poolAlias>');
    expect(e).toContain('<publicName xsi:type="xsd:string">YWWSBPC</publicName>');
    expect(e).toContain('<inputXml xsi:type="xsd:string"><![CDATA[<PARAM>');
  });

  it('builds getDescription with publicName only', () => {
    const e = buildSoapEnvelope({ method: 'getDescription', codeLang: 'FRA', poolAlias: 'P', publicName: 'X&Y' });
    expect(e).toContain('<wss:getDescription');
    expect(e).toContain('X&amp;Y');
    expect(e).not.toContain('inputXml');
  });

  it('computes a Basic token', () => {
    expect(basicToken('admin', 'pässword')).toBe('Basic YWRtaW46cMOkc3N3b3Jk');
    expect(basicToken('a', 'b')).toBe('Basic YTpi');
  });
});

// Response shaped like the example of the skill (reponses-retour-logs.md).
const KO = `<soapenv:Envelope><soapenv:Body><wss:runResponse><runReturn xsi:type="wss:CAdxResultXml">
<messages soapenc:arrayType="wss:CAdxMessage[1]"><messages href="#id0"/></messages>
<resultXml xsi:type="xsd:string" xsi:nil="true"/><status xsi:type="xsd:int">0</status></runReturn>
<multiRef id="id0" xsi:type="wss:CAdxMessage"><type xsi:type="xsd:string">3</type><message xsi:type="xsd:string">Fiche en cours de modification &amp; bloquée</message></multiRef>
</wss:runResponse></soapenv:Body></soapenv:Envelope>`;

describe('SOAP response', () => {
  it('reads status, messages and nil resultXml', () => {
    const r = parseSoapResponse(KO);
    expect(r).toEqual({ fault: null, status: 0, messages: [{ type: 3, message: 'Fiche en cours de modification & bloquée' }], resultXml: null });
    expect(salesforceVerdict(r, 200)).toMatchObject({ success: false, shownMessage: 'Fiche en cours de modification & bloquée' });
  });

  it('reproduces the SF rule: only type 1/2 messages = success even with status 0', () => {
    const r = parseSoapResponse(KO.replace('<type xsi:type="xsd:string">3</type>', '<type>2</type>'));
    expect(salesforceVerdict(r, 200).success).toBe(true);
    expect(salesforceVerdict({ fault: null, status: 0, messages: [], resultXml: null }, 200)).toMatchObject({ success: false, shownMessage: '' });
    expect(salesforceVerdict({ fault: null, status: 1, messages: [], resultXml: null }, 401).success).toBe(false);
  });

  it('reads resultXml CDATA and SOAP faults', () => {
    const ok = '<x:runResponse><resultXml><![CDATA[<RESULT><GRP ID="G"><FLD NAME="A">1</FLD></GRP></RESULT>]]></resultXml><status>1</status></x:runResponse>';
    expect(parseSoapResponse(ok)).toMatchObject({ status: 1, resultXml: '<RESULT><GRP ID="G"><FLD NAME="A">1</FLD></GRP></RESULT>' });
    expect(parseSoapResponse('<soapenv:Fault><faultcode>x</faultcode><faultstring>Pool not found</faultstring></soapenv:Fault>').fault).toBe('Pool not found');
  });
});

describe('WS description and inputXml', () => {
  const desc = '<ADXDESC><GRP NAM="GRP1" DIM="1"><FLD NAM="BPC_BPCNUM" TYP="Char" LEN="15"/></GRP><GRP NAM="GRP2" DIM="998"><FLD NAM="CCNCRM"/><FLD NAM="CNTLNA"/></GRP></ADXDESC>';

  it('reads groups and fields, keeping attributes raw', () => {
    const g = parseWsDescription(desc);
    expect(g.map((x) => [x.name, x.kind, x.fields.map((f) => f.name)])).toEqual([
      ['GRP1', 'GRP', ['BPC_BPCNUM']],
      ['GRP2', 'TAB', ['CCNCRM', 'CNTLNA']],
    ]);
    expect(g[0]?.fields[0]?.attrs).toEqual({ NAM: 'BPC_BPCNUM', TYP: 'Char', LEN: '15' });
  });

  it('generates an inputXml template like the SF connector', () => {
    const t = inputXmlTemplate(parseWsDescription(desc));
    expect(t).toContain('<GRP ID="GRP1">');
    expect(t).toContain('<TAB DIM="998" ID="GRP2" SIZE="1">');
    expect(checkInputXml(t)).toEqual([]);
  });

  it('flags what breaks X3', () => {
    expect(checkInputXml('<PARAM><FLD NAME="A">Dupont & Fils</FLD></PARAM>')[0]).toContain('unescaped "&"');
    expect(checkInputXml('<PARAM><GRP ID="A"></PARAM>').join(' ')).toContain('does not close');
    expect(checkInputXml('<X/>')[0]).toContain('<PARAM>');
  });

  it('masks secret-looking parameters', () => {
    expect(looksSecret('YLOGPASS')).toBe(true);
    expect(looksSecret('YZAPITOKEN')).toBe(true);
    expect(looksSecret('YLOGURL')).toBe(false);
  });
});
