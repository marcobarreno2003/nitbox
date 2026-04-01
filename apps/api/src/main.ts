import 'reflect-metadata'
import { NestFactory } from '@nestjs/core'
import { ValidationPipe } from '@nestjs/common'
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger'
import { AppModule } from './app.module'

async function bootstrap() {
  const app = await NestFactory.create(AppModule)

  app.setGlobalPrefix('api')
  app.enableCors()
  app.useGlobalPipes(new ValidationPipe({ whitelist: true }))

  // OpenAPI spec
  const config = new DocumentBuilder()
    .setTitle('NITBox API')
    .setDescription('Football analytics API for the 60 most important national teams in the world.')
    .setVersion('1.0')
    .addTag('teams',        'National teams and profiles')
    .addTag('matches',      'Match results and statistics')
    .addTag('competitions', 'Competitions and seasons')
    .addTag('players',      'Player profiles and stats')
    .addTag('standings',    'League tables and standings')
    .build()

  const document = SwaggerModule.createDocument(app, config)

  // Swagger UI (raw, for development)
  SwaggerModule.setup('api/swagger', app, document)

  // Redoc — NITBox branded docs
  app.use('/api/docs', (req: any, res: any) => {
    res.send(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>NITBox — API Docs</title>
          <meta charset="utf-8"/>
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
          <style>
            * { box-sizing: border-box; }
            body { margin: 0; padding: 0; background: #111111; }

            /* Sidebar */
            .menu-content { background: #111111 !important; }
            .sc-fzqMdD    { background: #111111 !important; }

            /* Main panel background */
            .sc-fznyAO, [class*="middle-panel"], [class*="api-content"] {
              background: #111111 !important;
            }

            /* Right panel (code samples) */
            [class*="right-panel"] { background: #1a1a1a !important; }

            /* Operation titles */
            h1, h2, h3, h4, h5 { color: #ffffff !important; font-family: Inter, sans-serif !important; }

            /* Parameter names */
            [class*="property-name"] { color: #22c55e !important; }

            /* Inline code */
            code { background: #1a1a1a !important; color: #22c55e !important; border-radius: 4px; padding: 2px 6px; }

            /* Response code 200 */
            [class*="token-200"], [class*="success"] td { color: #22c55e !important; }

            /* Dividers */
            [class*="operation-endpoint"] { background: #1a1a1a !important; border-radius: 8px; }

            /* Search box */
            [class*="search-input"] { background: #1a1a1a !important; color: #ffffff !important; border-color: #2a2a2a !important; }
          </style>
        </head>
        <body>
          <div id="redoc-container"></div>
          <script src="https://cdn.redoc.ly/redoc/latest/bundles/redoc.standalone.js"></script>
          <script>
            Redoc.init('/api/swagger-json', {
              hideDownloadButton: true,
              hideHostname: true,
              noAutoAuth: true,
              pathInMiddlePanel: true,
              theme: {
                colors: {
                  primary:  { main: '#22c55e' },
                  success:  { main: '#22c55e' },
                  warning:  { main: '#f59e0b' },
                  error:    { main: '#ef4444' },
                  text: {
                    primary:   '#ffffff',
                    secondary: '#888888',
                  },
                  border: { dark: '#2a2a2a', light: '#2a2a2a' },
                  responses: {
                    success: { color: '#22c55e', backgroundColor: '#0a2e1a' },
                    error:   { color: '#ef4444', backgroundColor: '#200a0a' },
                    redirect: { color: '#f59e0b', backgroundColor: '#1f1500' },
                    info:    { color: '#3b82f6', backgroundColor: '#05122e' },
                  },
                  http: {
                    get:    '#22c55e',
                    post:   '#3b82f6',
                    put:    '#f59e0b',
                    delete: '#ef4444',
                    patch:  '#a855f7',
                  },
                },
                typography: {
                  fontSize:      '15px',
                  lineHeight:    '1.6',
                  fontFamily:    'Inter, system-ui, sans-serif',
                  smoothing:     'antialiased',
                  headings: {
                    fontFamily:  'Inter, system-ui, sans-serif',
                    fontWeight:  '600',
                  },
                  code: {
                    fontSize:         '13px',
                    fontFamily:       'ui-monospace, Menlo, monospace',
                    lineHeight:       '1.5',
                    color:            '#22c55e',
                    backgroundColor:  '#1a1a1a',
                    wrap:             true,
                  },
                  links: { color: '#22c55e' },
                },
                sidebar: {
                  width:           '280px',
                  backgroundColor: '#111111',
                  textColor:       '#888888',
                  activeTextColor: '#ffffff',
                  groupItems: {
                    activeBackgroundColor: '#1a1a1a',
                    activeTextColor:       '#ffffff',
                    textTransform:         'uppercase',
                  },
                  level1Items: {
                    activeBackgroundColor: '#1a1a1a',
                    activeTextColor:       '#ffffff',
                  },
                  arrow: { size: '1.5em', color: '#888888' },
                },
                logo: {
                  maxHeight: '60px',
                  maxWidth:  '200px',
                  gutter:    '20px',
                },
                rightPanel: {
                  backgroundColor: '#1a1a1a',
                  width:           '40%',
                  textColor:       '#ffffff',
                },
                codeBlock: {
                  backgroundColor: '#0a0a0a',
                },
              },
            }, document.getElementById('redoc-container'))
          </script>
        </body>
      </html>
    `)
  })

  const port = process.env.API_PORT ?? 3001
  await app.listen(port)
  console.log(`API running on  http://localhost:${port}/api`)
  console.log(`Docs running on http://localhost:${port}/api/docs`)
}

bootstrap()
