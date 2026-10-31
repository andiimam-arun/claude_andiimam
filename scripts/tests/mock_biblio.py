#!/usr/bin/env python3
"""Server tiruan OpenAlex/Crossref/ORCID untuk menguji PIPA pengayaan (bukan datanya). Semua nilai sintetis."""
import hashlib, json, re, sys, threading, urllib.parse
from http.server import BaseHTTPRequestHandler, HTTPServer

H = lambda s: int(hashlib.sha1(s.encode()).hexdigest()[:8], 16)
REQS = []


def work(doi, title=None):
    h = H(doi or title)
    return {"id": f"https://openalex.org/W{h}", "doi": f"https://doi.org/{doi}" if doi else None, "title": title or f"[MOCK] {doi}",
            "publication_year": 2018 + h % 8, "cited_by_count": h % 120, "fwci": (h % 300) / 100,
            "citation_normalized_percentile": {"is_in_top_10_percent": h % 7 == 0}, "type": "article",
            "primary_location": {"source": {"display_name": "MOCK Journal", "issn_l": "0000-0000"}}, "open_access": {"is_oa": h % 2 == 0}}


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *a): pass

    def send(self, code, obj):
        body = json.dumps(obj).encode(); self.send_response(code); self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body))); self.end_headers(); self.wfile.write(body)

    def do_GET(self):
        u = urllib.parse.urlparse(self.path); qs = urllib.parse.parse_qs(u.query); REQS.append(self.path)
        if u.path == "/works" and "filter" in qs:
            f = qs["filter"][0]
            if f.startswith("doi:"):
                dois = [d.replace("https://doi.org/", "") for d in f[4:].split("|")]
                return self.send(200, {"results": [work(d) for d in dois if H(d) % 10 != 0]})
            if f.startswith("title.search:"):
                t = f[len("title.search:"):]
                if H(t) % 2 == 0:
                    return self.send(200, {"results": [work(None, t)]})
                return self.send(200, {"results": [work(None, "Completely different title about something else")]})
        if u.path.startswith("/works/"):                       # Crossref
            d = urllib.parse.unquote(u.path[len("/works/"):])
            if H(d) % 3 == 0:
                return self.send(404, {"status": "not found"})
            return self.send(200, {"message": {"container-title": ["MOCK Crossref Journal"], "ISSN": ["1111-1111"], "is-referenced-by-count": H(d) % 50,
                                               "issued": {"date-parts": [[2019]]}, "type": "journal-article"}})
        if u.path == "/authors" and "filter" in qs:
            os_ = [x.rsplit("/", 1)[-1] for x in qs["filter"][0][len("orcid:"):].split("|")]
            return self.send(200, {"results": [{"id": f"https://openalex.org/A{H(o)}", "orcid": f"https://orcid.org/{o}", "display_name": f"MOCK {o}", "works_count": H(o) % 80,
                                                "cited_by_count": H(o) % 900, "summary_stats": {"h_index": H(o) % 25, "i10_index": H(o) % 12}} for o in os_ if H(o) % 5 != 0]})
        m = re.match(r"/v3\.0/([\d-]+X?)/person", u.path)         # ORCID
        if m:
            return self.send(200, {"name": {"given-names": {"value": "Mock"}, "family-name": {"value": m.group(1)}}})
        self.send(404, {"error": "no route", "path": self.path})


def serve(port=0):
    srv = HTTPServer(("127.0.0.1", port), Handler)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv


if __name__ == "__main__":
    s = serve(int(sys.argv[1]) if len(sys.argv) > 1 else 8791); print("mock di", s.server_address); threading.Event().wait()
