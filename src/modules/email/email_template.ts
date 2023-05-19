export const PRIORLI_INVITATION_EMAIL_SCREENSHOT_LINKS: string[] = [
  'https://firebasestorage.googleapis.com/v0/b/priorli.appspot.com/o/public%2Fscreenshots%2FPriorli%20(500%20%C3%97%20300px)%20(Presentation%20(169))%20(2).png?alt=media&token=338391a1-3824-41c2-8482-7b343069c996',
  'https://firebasestorage.googleapis.com/v0/b/priorli.appspot.com/o/public%2Fscreenshots%2FPriorli%20(500%20%C3%97%20300px)%20(Presentation%20(169))%20(3).png?alt=media&token=6309b621-07b3-4262-b8bb-d25d61ff51a1',
];
export const invitationEmail = (
  language: string,
  signUpLink: string,
  secretCode: string,
  companyName: string,
  priorliLogo: string,
  companyLogo?: string,
  screenshots?: string[],
) =>
  language === 'en'
    ? `<!DOCTYPE html>
  <!DOCTYPE html>
  <html>
    <head>
      <meta charset="UTF-8">
      <title>Invitation to join your apartment group on Priorli</title>
    </head>
    <body style="font-family: Arial, sans-serif; font-size: 14px;">
      <table cellpadding="0" cellspacing="0" width="100%" bgcolor="#ffffff">
        <tr>
          <td style="padding: 20px;">
            <table cellpadding="0" cellspacing="0" width="100%">
              <tr>
                <td align="center" style="padding-bottom: 20px;">
                  ${
                    companyLogo
                      ? `<img src="${companyLogo}" alt="Company Logo" style="height: 100px;">`
                      : `<img src="${priorliLogo}" alt="Priorli Logo" style="height: 100px;">`
                  }
                </td>
              </tr>
              <tr>
                <td>
                  <p style="font-size: 16px; font-weight: bold; margin-bottom: 20px;">Invitation to join your apartment group on Priorli</p>
                  <p>You have been invited to join your apartment group on Priorli, an innovative housing management platform that makes communication, organization, and coordination between ${companyName} and tenants effortless.</p>
                  <p>With Priorli, you can:</p>
                  <ul>
                    <li>Receive and read announcements from ${companyName}</li>
                    <li>Report any faults or maintenance requests in your apartment</li>
                    <li>Communicate with ${companyName} and other tenants</li>
                    <li>Access important documents related to your apartment</li>
                    <li>View water usage reports for your apartment</li>
                    <li>Generate invoices for water usage and other services</li>
                  </ul>
                  <p>To get started, please click on the following link to create your account on Priorli:</p>
                  <p style="text-align: center;">
                    <a href="${signUpLink}" style="background-color: #FFDF6D; border-radius: 16px; color: #595D6B; display: inline-block; font-size: 16px; font-weight: bold; margin-bottom: 20px; padding: 10px 20px; text-decoration: none; text-transform: uppercase;">Create Account</a>
                  </p>
                  <p>Please note that you will need to use the same email address that this invitation was sent to in order to join your apartment group on the app.</p>
                  <p>You will also need to use the secret code provided below to join your apartment group on the app:</p>
                  <p style="text-align: center; font-size: 18px; font-weight: bold; margin-bottom: 20px;">${secretCode}</p>
                  <p>Once you sign up, you will be able to access all the relevant information about your apartment building and participate in the apartment group chat. You can also report any maintenance requests or issues, communicate with other tenants, and stay up-to-date on announcements from ${companyName}.</p>
                  <p>In addition, you will be able to view your water usage reports and generate invoices for water usage and other services on Priorli, making it easier than ever to keep track of your bills and payments.</p>
                  <p>Check out some screenshots of Priorli below:</p>
                  <p style="text-align: center;">
                    ${screenshots
                      ?.map(
                        (screenshot) => `
                      <img src="${screenshot}" alt="Screenshot" style="max-width: 100%; height: auto; margin-bottom: 10px;">
                    `,
                      )
                      .join('')}
                  </p>
                  <p>If you have any questions or concerns, please don't hesitate to contact us at contact@priorli.com.</p>
  <p>We hope you enjoy using Priorli!</p>
  <p>Best regards,</p>
  <p>Priorli for ${companyName}</p>
  </td>
  </tr>
  </table>
  </td>
  </tr>
  </table>
  
    </body>
  </html>
  `
    : `<!DOCTYPE html>
  <html>
    <head>
      <meta charset="UTF-8">
      <title>Kutsu liittyä Priorliin asuntoyhtiösi ryhmään</title>
    </head>
    <body style="font-family: Arial, sans-serif; font-size: 14px;">
      <table cellpadding="0" cellspacing="0" width="100%" bgcolor="#ffffff">
        <tr>
          <td style="padding: 20px;">
            <table cellpadding="0" cellspacing="0" width="100%">
              <tr>
              <td align="center" style="padding-bottom: 20px;">
              ${
                companyLogo
                  ? `<img src="${companyLogo}" alt="Company Logo" style="height: 100px;">`
                  : `<img src="${priorliLogo}" alt="Priorli Logo" style="height: 100px;">`
              }
            </td>
              </tr>
              <tr>
                <td>
                  <p style="font-size: 16px; font-weight: bold; margin-bottom: 20px;">Kutsu liittyä Priorliin asuntoyhtiösi ryhmään</p>
                  <p>Sinut on kutsuttu liittymään asuntoyhtiösi ryhmään Priorli-sovelluksessa, innovatiivisessa asuntojen hallintatyökalussa, joka tekee yhteistyöstä, organisaatiosta ja kommunikaatiosta asuntoyhtiösi ja asukkaiden välillä vaivatonta.</p>
                  <p>Priorlin avulla voit:</p>
                  <ul>
                    <li>Vastaanottaa ja lukea tiedotteita ${companyName}ltä</li>
                    <li>Ilmoittaa asunnossasi havaituista vioista tai huoltotarpeista</li>
                    <li>Keskustella ${companyName}n ja muiden asukkaiden kanssa</li>
                    <li>Selata tärkeitä dokumentteja liittyen asuntoosi</li>
                    <li>Nähdä vedenkulutusraportit asunnostasi</li>
                    <li>Generoida laskuja vedenkulutuksesta ja muista palveluista</li>
                  </ul>
                  <p>Aloittaaksesi, klikkaa alla olevaa linkkiä luodaksesi tilisi Priorliin:</p>
                  <p style="text-align: center;">
                    <a href="${signUpLink}" style="background-color: #FFDF6D; border-radius: 16px; color: #595D6B; display: inline-block; font-size: 16px; font-weight: bold; margin-bottom: 20px; padding: 10px 20px; text-decoration: none; text-transform: uppercase;">Luo tili</a>
                  </p>
                  <p>Huomioithan, että sinun tulee käyttää samaa sähköpostiosoitetta, jolle tämä kutsu on lähetetty, liittyäksesi asuntoyhtiösi ryhmään sovelluksessa.</p>
                  <p>Tarvitset myös alla olevan salakoodin liittyäksesi asuntoyhtiösi ryhmään sovelluksessa:</p>
                  <p style="text-align: center; font-size: 18px; font-weight: bold; margin-bottom: 20px;">${secretCode}</p>
                  <p>Kun olet rekisteröitynyt, pääset käsiksi kaikkiin relevantteihin tietoihin asuntorakennuksestasi ja voit osallistua asuntoyhtiön ryhmäkeskusteluun. Voit myös ilmoittaa mahdollisista huoltotarpeista tai ongelmista, kommunikoida muiden asukkaiden kanssa ja pysyä ajan tasalla asuntoyhtiön tiedotteista.</p>
  <p>Lisäksi voit Priorlin avulla nähdä vedenkulutusraporttisi ja generoida laskuja vedenkulutuksesta ja muista palveluista, mikä tekee laskujen ja maksujen seurannasta helpompaa kuin koskaan.</p>
  <p>Tässä muutama näyttökuvakaappaus Priorlista:</p>
  <p style="text-align: center;">
                    ${screenshots
                      ?.map(
                        (screenshot) => `
                      <img src="${screenshot}" alt="Screenshot" style="max-width: 100%; height: auto; margin-bottom: 10px;">
                    `,
                      )
                      .join('')}
                  </p>
  <p>Jos sinulla on kysyttävää tai huolenaiheita, älä epäröi ottaa yhteyttä meihin osoitteessa contact@priorli.com.</p>
  <p>Toivomme, että nautit Priorlin käytöstä!</p>
  <p>Ystävällisin terveisin,</p>
  <p>Priorli,</p>
  </td>
  </tr>
  </table>
  </td>
  </tr>
  </table>
  
    </body>
  </html>
  `;

export const marketingEmail = (
  language: string = 'fi',
  promoCode: string,
  senderName: string,
  contactEmail: string,
  priorliLogo: string,
  priorliWebsite: string,
  contactFormLink: string,
  screenshots?: string[],
) =>
  language === 'en'
    ? `
  <!DOCTYPE html>
  <html>
    <head>
      <meta charset="UTF-8">
      <title>Best Housing Management Tools from Priorli</title>
    </head>
    <body style="font-family: Arial, sans-serif; font-size: 14px;">
      <table cellpadding="0" cellspacing="0" width="100%" bgcolor="#ffffff">
        <tr>
          <td style="padding: 20px;">
            <table cellpadding="0" cellspacing="0" width="100%">
              <tr>
                <td align="center" style="padding-bottom: 20px;">
                  <img src="${priorliLogo}" alt="Priorli logo" style="height: 50px;">
                </td>
              </tr>
              <tr>
                <td>
                  <p style="font-size: 16px; font-weight: bold; margin-bottom: 20px;">Best Housing Management Tools from Priorli</p>
                  <p>We are excited to introduce Priorli, the ultimate solution for managing the day-to-day tasks of your housing association. Our software allows you to easily store and manage important documents, make announcements to tenants, schedule events, manage invoices, create voting polls, send messages in real-time, help tenants report faults in their apartments, and even generate water usage reports.</p>
                  <p>Priorli is a centralized platform that helps housing management save time, reduce costs, and enhance stakeholder satisfaction. Our user-friendly interface streamlines the housing management process, allowing you to focus on what really matters - providing the best living experience for your tenants.</p>
                  <p>To give you an idea of what Priorli can offer, we have included two screenshots of our software below. Our solution is mobile-optimized, meaning you can manage your properties anywhere, anytime.</p>
                  <p style="text-align: center;">
                    ${screenshots
                      ?.map(
                        (screenshot) => `
                      <img src="${screenshot}" alt="Screenshot" style="max-width: 100%; height: auto; margin-bottom: 10px;">
                    `,
                      )
                      .join('')}
                  </p>
                  <p>We are committed to providing expert support, so if you have any questions or want to learn more about our solution, don't hesitate to contact us at  or use our contact form at ${contactFormLink}.</p>
                  <p>We want to offer something special to our early customers. That's why we are giving you an exclusive promo code that will give you six months free of our annual subscription package. Just enter the code ${promoCode} in the contact form to redeem the offer.</p>
                  <p>To get started, simply visit our website at <a href="${priorliWebsite}">${priorliWebsite}</a> and sign up for a free demo account.</p>
                  <p>Thank you for considering Priorli as your housing management tool. If you have any questions or concerns, don't hesitate to contact us at ${contactEmail}. We would be happy to assist you.</p>
                  <p>Best regards,</p>
                  <p>${senderName}<br>
                    Priorli</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
  </html>
`
    : `
<!DOCTYPE html>
<html>
  <head>
    <meta charset="UTF-8">
    <title>Parhaat asuntojen hallintatyökalut Priorliilta</title>
  </head>
  <body style="font-family: Arial, sans-serif; font-size: 14px;">
    <table cellpadding="0" cellspacing="0" width="100%" bgcolor="#ffffff">
      <tr>
        <td style="padding: 20px;">
          <table cellpadding="0" cellspacing="0" width="100%">
            <tr>
              <td align="center" style="padding-bottom: 20px;">
                <img src="${priorliLogo}" alt="Priorli logo" style="height: 50px;">
              </td>
            </tr>
            <tr>
              <td>
                <p style="font-size: 16px; font-weight: bold; margin-bottom: 20px;">Parhaat asuntojen hallintatyökalut Priorliilta</p>
                <p>Olemme innoissamme esitellä Priorli, lopullinen ratkaisu asunto-osakeyhtiön päivittäisten tehtävien hallintaan. Ohjelmistomme avulla voit helposti tallentaa ja hallita tärkeitä asiakirjoja, ilmoittaa asukkaille, aikatauluttaa tapahtumia, hallita laskuja, luoda äänestyksiä, lähettää viestejä reaaliajassa, auttaa asukkaita raportoimaan vikoja asunnoistaan ja jopa tuottamaan vesikäyttöraportteja.</p>
                <p>Priorli on keskitetty alusta, joka auttaa asuntojen hallintaa säästämään aikaa, vähentämään kustannuksia ja parantamaan osakkeenomistajien tyytyväisyyttä. Käyttäjäystävällinen käyttöliittymämme helpottaa asuntojen hallinnan prosessia, jolloin voit keskittyä siihen, mikä todella merkitsee - tarjota parhaan asumiskokemuksen asukkaillesi.</p>
                <p>Antaaksemme sinulle käsityksen siitä, mitä Priorli voi tarjota, olemme sisällyttäneet alla oleviin kahteen kuvakaappaukseen ohjelmistostamme. Ratkaisumme on mobiilioptimoitu, mikä tarkoittaa, että voit hallita asuntoja missä tahansa ja milloin tahansa.</p>
                <p style="text-align: center;">
                ${screenshots
                  ?.map(
                    (screenshot) => `
                  <img src="${screenshot}" alt="Screenshot" style="max-width: 100%; height: auto; margin-bottom: 10px;">
                `,
                  )
                  .join('')}
              </p>
                <p>Olemme sitoutunet tarjoamaan asiantuntevaa tukea, joten jos sinulla on kysyttävää tai haluat tietää lisää ratkaisustamme, älä epäröi ottaa meihin yhteyttä sähköpostitse osoitteessa <a href="${contactEmail}">${contactEmail}</a> tai käyttää yhteydenottolomakettamme osoitteessa ${contactFormLink}.</p>
                <p>Haluamme tarjota jotain erityistä ensimmäisille asiakkaillemme. Siksi tarjoamme sinulle yksinoikeudellisen promo-koodin, joka antaa sinulle kuusi kuukautta ilmaiseksi vuosittaisesta tilauspaketistamme. Syötä vain koodi ${promoCode} yhteydenottolomakkeessa lunastaaksesi tarjouksen.</p>
                <p>Aloittaaksesi, vieraile vain verkkosivustollamme osoitteessa <a href="${priorliWebsite}">${priorliWebsite}</a> ja rekisteröidy ilmaiseksi demotilille.</p>
                <p>Kiitos, että harkitset Priorli -palvelua asuntojen hallintatyökalunasi. Jos sinulla on kysyttävää tai huolenaiheita, älä epäröi ottaa meihin yhteyttä sähköpostitse osoitteessa <a href="${contactEmail}">${contactEmail}</a>. Me autamme sinua mielellämme.</p>
                <p>Ystävällisin terveisin,</p>
                <p>${senderName}<br>
                Priorli</p>
                </td>
                </tr>
                </table>
                </td>
                </tr>
                </table>
                
                  </body>
                </html>
`;
