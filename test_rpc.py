import urllib.request
import json
import ssl

url = 'https://127.0.0.1:61281/exa.language_server_pb.LanguageServerService/GetCascadeModelConfigData'
headers = {
    'Content-Type': 'application/json',
    'X-Codeium-Csrf-Token': '6b21519a-d187-48c9-a10c-093c0d5f44ed',
    'Connect-Protocol-Version': '1'
}
data = b'{}'

req = urllib.request.Request(url, data=data, headers=headers, method='POST')
ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

try:
    with urllib.request.urlopen(req, context=ctx) as response:
        print(response.read().decode('utf-8'))
except Exception as e:
    print(e)
