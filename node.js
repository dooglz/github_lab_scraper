var GitHubApi = require('github')
var Cookies = require('js-cookie')
var github = new GitHubApi();
var authenticated = false;;
var u, p;
repolinks = [];


function genericCallback(err, res) {
    if (err) {
        throw err;
    } else {
        console.log(res)
    }
}

$(document).ready(function() {
    console.log("hello world");
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
    console.log(repolinks);
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
    console.log("Attempting to authenticate user: " + u);
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
        console.info("Autheticated");
        if (true) {
            //if remeber me
            Cookies.set('uid', u);
            Cookies.set('apikey', p);
        }
        authenticated = true;
        console.log(r);
        $("#loginForm").hide();
        $('#avatar').attr("src", r.data.avatar_url);
        $('#username').html(r.data.name);
        $('#userstats').html(" Reqs remain: " + r.meta["x-ratelimit-remaining"]);
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
            Cookies.set('repolinks', repolinks);
        }
    }
    console.log(repolinks);
    InitialSweep();
}

function InitialSweep() {
    for (let value of repolinks) {
        console.log(Object.assign({}, value, {
            per_page: 2,
            page: 1
        }));
        var param = {
            owner: value.owner,
            repo: value.repo,
            per_page: 2,
            page: 1
        };
        github.repos.getCommits(param,
            function(err, res) {
                if (err) {
                    throw err;
                }
                value.last_commits = res.data;
                console.log(value);
            });
    }

}


$("#gobtn").click(function(event) {
    event.preventDefault();
    BuildTable();
});

function BuildTable() {
    var table = $('<table></table>').addClass('table');
    table.append("<thead><tr><th scope=\"col\">User</th><th scope=\"col\">last Commit date</th><th scope=\"col\">foo</th></tr></thead>");
    tbody = $('<tbody></tbody>');
    for (var value of repolinks) {
        var row = $('<tr></tr>');
        row.append($('<th scope="row"></th>').text(value.owner));
        if (value.last_commits !== undefined && value.last_commits.length > 0) {
            var d = new Date(value.last_commits[0].commit.author.date);
            row.append($('<td></td>').text(d.toUTCString()));
        } else {
            row.append($('<td></td>').text("Nan"));
        }
        row.append($('<td></td>').text("doop"));
        tbody.append(row);
    }

    $('#tablezone').append(table.append(tbody));
}