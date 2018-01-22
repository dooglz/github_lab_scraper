var GitHubApi = require('github')
var Cookies = require('js-cookie')
var cool = require('cool-ascii-faces')
var moment = require('moment');
moment().format();
var github = new GitHubApi();
var authenticated = false;;
var u, p;
var repolinks = [];
var lastResponse = new Date();
var callsRemain = 0;
var requestsFired = 0;
//var lennys = ["( ͡° ͜ʖ ͡°)","ヽ༼ຈل͜ຈ༽ﾉ","( ◔ ʖ̯ ◔ )","┌(° ͜ʖ͡°)┘","( ͡° ͜V ͡°)"];


function genericCallback(err, res) {
    if (err) {
        throw err;
    } else {
        metaHandler(res);
        console.log(res);
    }
}

function metaHandler(res) {
    requestsFired++;
    var d = new Date();
    if (d < lastResponse) {
        return;
    }
    lastResponse = d;
    callsRemain = res.meta["x-ratelimit-remaining"];
    $("#reqsremain").text(callsRemain);
    $("#responseDiv").text(requestsFired + " - " + lastResponse.toLocaleTimeString());
}

$(document).ready(function() {
    console.log("Document Ready");
    $("#forkdate").val(moment().format('YYYY-MM-DD'));
    repolinks = Cookies.getJSON('repolinks');
    if (repolinks !== undefined) {
        var s = "";
        for (var value of repolinks) {
            s += value.input_url + "\n";
        }
        $("#repolinks").val(s);
    } else {
        repolinks = [];
    }
    AuthenticateViaCookies();
});

$("#loginForm").submit(function(event) {
    event.preventDefault();
    AuthenticateViaButton();
});



function AuthenticateViaCookies() {
    console.log("Looking at  cookies");
    if (Cookies.get('uid') !== undefined && Cookies.get('apikey') !== undefined) {
        console.log("using cookies");
        u = Cookies.get('uid');
        p = Cookies.get('apikey');
        if (u == "" || p == "") {
            console.log("Invalid cookies ");
            Cookies.remove('uid');
            Cookies.remove('apikey');
            return;
        }
    } else {
        return;
    }
    console.log("Attempting to authenticate user from cookies: " + u);
    github.authenticate({
        type: 'basic',
        username: u,
        password: p
    });
    github.users.get({}, Authenticate_stage2);
}

function AuthenticateViaButton() {
    console.log("Good day");
    u = $("#emailbox").val();
    p = $("#apibox").val();
    if (u == "" || p == "") {
        console.log("Invalid entry");
        return;
    }
    console.log("Attempting to authenticate user: ", u);
    github.authenticate({
        type: 'basic',
        username: u,
        password: p
    });
    github.users.get({}, Authenticate_stage2);
}

function Authenticate_stage2(e, r) {
    if (e) {
        console.error("Authetication failed");
        authenticated = false;
    } else {
        metaHandler(r);
        console.info("Autheticated");
        if (true) {
            //if remeber me
            Cookies.set('uid', u);
            Cookies.set('apikey', p);
        }
        authenticated = true;
        console.log("Authenticated user data", r);
        $("#loginForm").hide();
        $('#avatar').attr("src", r.data.avatar_url);
        $('#username').html(r.data.name);
        $('#userStats').removeAttr('hidden');
    }
    u = p = "";
}

$("#repoform").submit(function(event) {
    event.preventDefault();
    ParseRepoLinks();
});


function ParseRepoLinks() {
    var matcher = /^(?:\w+:)?\/\/([^\s\.]+\.\S{2}|localhost[\:?\d]*)\S*$/;

    var txt = $("#repolinks").val().replace(/;|,/g, " ").split(/\r?\n/);
    repolinks = [];
    for (var value of txt) {
        value = value.trim();
        if (matcher.test(value)) {
            if (value[value.length - 1] === '/') {
                value = value.slice(0, -1);
            }
            if (value.lastIndexOf(".git") !== -1) {
                value = value.substr(0, value.lastIndexOf(".git"));
            }
            var split = value.split('/');
            var repo = split[split.length - 1];
            var owner = split[split.length - 2];
            repolinks.push({
                input_url: value,
                owner: owner,
                repo: repo
            });
            repolinks = repolinks.sort((a, b) => a.owner.localeCompare(b.owner));
            //remove duplicates (needs to be sorted for this to worl)
            repolinks = repolinks.filter((current, index, array) =>
                index === 0 || current.owner !== array[index - 1].owner)
            Cookies.set('repolinks', repolinks);
        }
    }
    console.log("repolinks parsed", repolinks);
    BuildTable();
    SyncTable(true);
}


$("#gobtn").click(function(event) {
    event.preventDefault();
    SyncTable();
});

$("#dumpBtn").click(function(event) {
    event.preventDefault();
    console.log("dump", repolinks);
});

var table_rules = [{
        t: "user",
        h: true,
        func: function(v) {
            var n = v.owner;
            if (data_user(v, true) && v.data_user.name !== null && v.data_user.name !== v.owner) {
                n = v.data_user.name + " (" + v.owner + ")";
            }
            return '<a href="' + v.input_url + '">' + n + '</a>';
        }
    },
    {
        t: "Last Commit date",
        need: [data_commits],
        func: function(v) {
            if (v.data_commits.length > 0) {
                var d = new Date(v.data_commits[0].commit.author.date);
                var n = moment(d).fromNow() + " -- " + d.toLocaleString();
                return '<a href="' + v.data_commits[0].html_url + '">' + n + '</a>';
            } else {
                return "no Commits";
            }
        }
    },
    {
        t: "Clean Repo",
        need: [data_commits, data_tree],
        func: cleanRepo
    },
    {
        t: "Lab",
        need: [data_commits, data_commit_data],
        func: getLab
    }
];



var table_objects = {};

function BuildTable() {
    if (table_objects.hasOwnProperty('table')) {
        table_objects.table.remove();
    }
    table_objects = {
        headers: {},
        rows: {}
    };

    var table = $('<table></table>').addClass('table');
    table_objects.table = table;
    var headerThead = $("<thead><tr></tr></thead>");
    for (var col of table_rules) {
        var o = $("<th scope=\"col\">" + col.t + "</th>");
        table_objects.headers[col.t] = o;
        headerThead.append(o);
    }
    table.append(headerThead);
    tbody = $('<tbody></tbody>');


    for (var value of repolinks) {
        var row = $('<tr></tr>');
        table_objects.rows[value.owner] = {};
        for (var col of table_rules) {
            var txt = "-";
            if (col.offline) {
                txt = col.d(value);
            };
            var o = (col.h ? $('<th scope="row"></th>') : $('<td></td>')).text(txt);
            table_objects.rows[value.owner][col.t] = o;
            row.append(o);
        }
        tbody.append(row);
    }

    $('#tablezone').append(table.append(tbody));
}

function UpdateTable(r, offline) {
    let repo = r;
    const row = table_objects.rows[repo.owner];
    for (let rule of table_rules) {
        let cell = row[rule.t];
        if (rule.need && (offline || !rule.need.every(function(e) {
                return e(repo);
            }))) {
            cell.html("pending");
        } else {
            cell.html(rule.func(repo));
        }
    }
}

function SyncTable(offline) {
    for (var value of repolinks) {
        UpdateTable(value, offline);
    }
}


//----- Rule Parsers -----

function getLab(r) {
    let repo = r;
    if (repo.data_commit_data.files) {
        let regex = /labs\/practicals\/(\d+)_/g;
        let f = repo.data_commit_data.files;
        let practicals = [];
        for (let file of f) {
            let m = regex.exec(file.filename);
            if (m != null) {
                practicals.push(m[1]);
            }
            regex.lastIndex = 0;
        }
        var highest = 0;
        //console.log(repo.owner, practicals);
        for (let prac of practicals) {
            highest = Math.max(highest, parseInt(prac));
        }
        return highest;
    }
    return "Unknown";
}

function cleanRepo(r) {
    let repo = r;
    if (repo.data_tree.tree) {
        let regex = /\S*(\.user|\.filters|\.vcxproj|\.exe|\.dll|\.lib)/g;
        let f = repo.data_tree.tree;
        for (let file of f) {
            let m = regex.exec(file.path);
            if (m != null) {
                return '<a href="' + repo.input_url + "/blob/" + repo.data_tree.sha + "/" + file.path + '">' + "NO- " + m[1]; + '</a>';
            }
        }
        return "Yes";
    }
    return "Unknown";
}

//----- Data Grabbers -----

function data_commits(repo, o) {
    let name = "data_commits"
    let param = {
        owner: repo.owner,
        repo: repo.repo,
        per_page: 2,
        page: 1
    };
    let call = github.repos.getCommits;
    return data_man(name, repo, param, call, o);
}

function data_user(repo, o) {
    let name = "data_user"
    let param = {
        username: repo.owner,
    };
    let call = github.users.getForUser;
    return data_man(name, repo, param, call, o);
}

function data_commit_data(repo, o) {
    let name = "data_commit_data"
    let param = {
        owner: repo.owner,
        repo: repo.repo,
        sha: repo.data_commits[0].sha
    };
    let call = github.repos.getCommit;
    return data_man(name, repo, param, call, o);
}

function data_tree(repo, o) {
    let name = "data_tree"
    let param = {
        owner: repo.owner,
        repo: repo.repo,
        sha: repo.data_commits[0].sha,
        recursive: true
    };
    let call = github.gitdata.getTree;
    return data_man(name, repo, param, call, o);
}

function data_man(n, r, p, c, o) {
    let repo = r;
    if (repo[n] && repo[n].status === 2) {
        return true;
    } else if (repo[n] && repo[n].status === 1) {
        return false;
    } else {
        repo[n] = {
            status: 1
        };
        c(p,
            function(err, res) {
                if (err) {
                    throw err;
                }
                metaHandler(res);
                repo[n] = res.data;
                repo[n].status = 2;
                if (!o) {
                    UpdateTable(repo)
                };
            });
    }
}

//--------------------------
$("#findforkbtn").click(function(event) {
    event.preventDefault();
    findrepos();
});

function findrepos() {
    u = $("#basic-url").val();
    $("#forklinks").val("");
    var split = u.split('/');
    var repo = split[split.length - 1];
    var owner = split[split.length - 2];

    github.repos.getForks({
            owner: owner,
            repo: repo,
            per_page: 100,
            page: 1
        },
        function(err, res) {
            if (err) {
                throw err;
            } else {
                metaHandler(res);
                console.log(res.data);
                var s = "";
                var d = new Date($("#forkdate").val());
                for (r of res.data) {
                    if (new Date(r.created_at) >= d) {
                        s += r.html_url + "\n";
                    }
                }
                $("#forklinks").val(s);
            }

        }

    );
}